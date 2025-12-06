// lib/fax_re_ocr.ts
// これまで保存された cs_kaipoke_info.documents を起点に、cs_docs を補完するバッチ
// - cs_docs に存在しない URL → ABBYY + OpenAI で OCR + 要約 + applicable_date を生成して insert
// - 既に cs_docs にある URL → cs_kaipoke_info.documents 側の label / acquired_at / doc_type_id を同期更新
//
// 期待環境変数:
//   OPENAI_API_KEY
//   ABBYY_APPLICATION_ID
//   ABBYY_API_KEY
//   ABBYY_END_POINT   (例: https://cloud-westus.ocrsdk.com)
//
// 事前に以下を実行済み想定:
//   alter table public.cs_docs
//     add column if not exists cs_documents_entry_id uuid null;

import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import OpenAI from "openai";

export type FaxReOcrOptions = {
  daysBack?: number;   // 何日前までを対象にするか（documents[].acquired_at 起点）。未指定なら全期間
  limit?: number;      // 1回の実行で処理する最大ドキュメント数（新規 + 更新の合計）
  dryRun?: boolean;    // true の場合は DB 更新せずにログだけ
  verbose?: boolean;   // true なら console.log を多めに出す
};

export type FaxReOcrResult = {
  ok: boolean;
  scannedDocs: number;       // 候補としてスキャンした JSON ドキュメント数
  toAnalyzeCount: number;    // OCR+要約が必要だった件数
  analyzedCount: number;     // 実際に OCR+要約を実行した件数
  updatedMetaCount: number;  // cs_docs の doc_name / applicable_date / doc_type_id などメタ情報だけ更新した件数
  skippedNoUrl: number;      // URL がなくスキップ
  skippedLimit: number;      // limit 超過でスキップ
  errors: { url: string; error: string }[];
};

type CsKaipokeInfoRow = {
  id: string;
  kaipoke_cs_id: string;
  documents: unknown | null;
};

type DocumentJsonEntry = {
  id?: string;
  url?: string;
  label?: string;
  type?: string;
  mimeType?: string;
  acquired_at?: string;
  uploaded_at?: string;
  doc_type_id?: string;
};

type CandidateDoc = {
  url: string;
  csKaipokeInfoId: string;
  kaipokeCsId: string;
  label: string | null;
  docTypeId: string | null;
  acquiredAt: string | null;
  jsonId: string | null;    // cs_kaipoke_info.documents[].id （UUID）
};

type CsDocsRow = {
  id: string;
  url: string;
  kaipoke_cs_id: string | null;
  doc_type_id: string | null;
  doc_name: string | null;
  applicable_date: string | null; // 'YYYY-MM-DD' or null
  cs_documents_entry_id: string | null;
};

type UserDocMasterRow = {
  id: string;
  label: string;
  category: string;
};

interface OcrSummaryJson {
  summary?: string;
  applicable_date?: string | null;
  confidence?: number | null;
  [key: string]: unknown;
}

const DEFAULT_LIMIT = 5;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ABBYY_APPLICATION_ID = process.env.ABBYY_APPLICATION_ID;
const ABBYY_API_KEY = process.env.ABBYY_API_KEY;
const ABBYY_END_POINT = process.env.ABBYY_END_POINT;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * label をキーに使いやすいよう正規化
 * - 空白を全部削除して trim
 */
function normalizeLabelForKey(label: string): string {
  return label.replace(/\s+/g, "").trim();
}

/**
 * user_doc_master (category='cs_doc') を読み込み、
 * normalize(label) => id のマップを作る
 */
async function loadCsDocMasterMap(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("user_doc_master")
    .select("id, label, category")
    .eq("category", "cs_doc");

  if (error) {
    console.error("[fax_re_ocr] user_doc_master fetch error:", error.message);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of (data ?? []) as UserDocMasterRow[]) {
    if (!row.label) continue;
    const key = normalizeLabelForKey(row.label);
    map[key] = row.id;
  }
  return map;
}

/**
 * メイン処理
 */
export async function runFaxReOcr(
  options: FaxReOcrOptions = {},
): Promise<FaxReOcrResult> {
  const {
    daysBack,
    limit = DEFAULT_LIMIT,
    dryRun = false,
    verbose = false,
  } = options;

  const result: FaxReOcrResult = {
    ok: true,
    scannedDocs: 0,
    toAnalyzeCount: 0,
    analyzedCount: 0,
    updatedMetaCount: 0,
    skippedNoUrl: 0,
    skippedLimit: 0,
    errors: [],
  };

  try {
    // 0) cs_doc マスターの逆引きマップをロード
    const docTypeMap = await loadCsDocMasterMap();

    // 1) cs_kaipoke_info から documents 付きのレコードを取得
    const { data: csRows, error: csErr } = await supabase
      .from("cs_kaipoke_info")
      .select("id, kaipoke_cs_id, documents")
      .order("kaipoke_cs_id", { ascending: true });

    if (csErr) {
      throw new Error(`cs_kaipoke_info fetch error: ${csErr.message}`);
    }

    const cutoffDate: Date | null = (() => {
      if (!daysBack || daysBack <= 0) return null;
      const d = new Date();
      d.setDate(d.getDate() - daysBack);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const candidates: CandidateDoc[] = [];

    // 2) JSON documents をフラット化して候補リストを作る
    for (const row of (csRows ?? []) as CsKaipokeInfoRow[]) {
      if (!row.documents) continue;

      let docsJson: DocumentJsonEntry[];
      try {
        if (Array.isArray(row.documents)) {
          docsJson = row.documents as DocumentJsonEntry[];
        } else if (typeof row.documents === "string") {
          docsJson = JSON.parse(row.documents) as DocumentJsonEntry[];
        } else {
          continue;
        }
      } catch {
        continue;
      }

      for (const doc of docsJson) {
        result.scannedDocs++;

        const url = doc.url ?? "";
        if (!url) {
          result.skippedNoUrl++;
          continue;
        }

        // daysBack が指定されていれば acquired_at 起点で絞る
        if (cutoffDate && doc.acquired_at) {
          const acqDate = new Date(doc.acquired_at);
          if (acqDate < cutoffDate) continue;
        }

        candidates.push({
          url,
          csKaipokeInfoId: row.id,
          kaipokeCsId: row.kaipoke_cs_id,
          label: doc.label ?? null,
          docTypeId: doc.doc_type_id ?? null,
          acquiredAt: doc.acquired_at ?? null,
          jsonId: doc.id ?? null,
        });
      }
    }

    if (verbose) {
      console.log("[fax_re_ocr] candidates from JSON:", candidates.length);
    }
    if (candidates.length === 0) return result;

    // limit を超えないように候補をざっくり絞る（実際には後で「要処理」の数でさらに絞る）
    const candidateSlice = candidates.slice(0, limit * 3);

    // 3) cs_docs 側の既存レコードを URL で一括取得
    const uniqueUrls = Array.from(new Set(candidateSlice.map((c) => c.url)));
    const { data: existingDocs, error: existErr } = await supabase
      .from("cs_docs")
      .select(
        "id, url, kaipoke_cs_id, doc_type_id, doc_name, applicable_date, cs_documents_entry_id",
      )
      .in("url", uniqueUrls);

    if (existErr) {
      throw new Error(`cs_docs fetch error: ${existErr.message}`);
    }

    const existingByUrl = new Map<string, CsDocsRow>();
    for (const row of (existingDocs ?? []) as CsDocsRow[]) {
      existingByUrl.set(row.url, row);
    }

    const needAnalyze: CandidateDoc[] = [];
    const needMetaUpdate: { candidate: CandidateDoc; existing: CsDocsRow }[] =
      [];

    // 4) それぞれの URL について「新規作成」か「メタ情報更新」かを判定
    for (const cand of candidateSlice) {
      const existing = existingByUrl.get(cand.url);

      if (!existing) {
        needAnalyze.push(cand);
        continue;
      }

      const jsonLabel = cand.label ?? null;
      const jsonDate = cand.acquiredAt ? cand.acquiredAt.slice(0, 10) : null;

      const needsNameUpdate =
        jsonLabel !== null &&
        jsonLabel.trim() !== "" &&
        jsonLabel !== existing.doc_name;

      const needsDateUpdate =
        jsonDate !== null &&
        jsonDate !== existing.applicable_date;

      const resolvedDocTypeIdExisting =
        cand.docTypeId ??
        existing.doc_type_id ??
        (cand.label
          ? docTypeMap[normalizeLabelForKey(cand.label)] ?? null
          : null);

      const needsDocTypeUpdate =
        resolvedDocTypeIdExisting !== existing.doc_type_id;

      const needsEntryIdUpdate =
        (cand.jsonId ?? null) !== existing.cs_documents_entry_id;

      if (
        needsNameUpdate ||
        needsDateUpdate ||
        needsDocTypeUpdate ||
        needsEntryIdUpdate
      ) {
        needMetaUpdate.push({ candidate: cand, existing });
      }
    }

    // 5) limit に収まるように、新規 + 更新を切り分け
    const availableForAnalyze = Math.max(
      0,
      limit - Math.min(needMetaUpdate.length, limit),
    );

    const analyzeTargets = needAnalyze.slice(0, availableForAnalyze);
    const metaUpdateTargets = needMetaUpdate.slice(
      0,
      limit - analyzeTargets.length,
    );

    result.toAnalyzeCount = analyzeTargets.length;
    if (needAnalyze.length > analyzeTargets.length) {
      result.skippedLimit += needAnalyze.length - analyzeTargets.length;
    }

    if (verbose) {
      console.log("[fax_re_ocr] analyzeTargets:", analyzeTargets.length);
      console.log("[fax_re_ocr] metaUpdateTargets:", metaUpdateTargets.length);
    }

    // 6) メタ情報だけの更新（doc_name / applicable_date / doc_type_id / cs_documents_entry_id）
    for (const { candidate, existing } of metaUpdateTargets) {
      if (dryRun) continue;

      const jsonLabel = candidate.label ?? existing.doc_name;
      const jsonDate = candidate.acquiredAt
        ? candidate.acquiredAt.slice(0, 10)
        : existing.applicable_date;

      const resolvedDocTypeId =
        candidate.docTypeId ??
        existing.doc_type_id ??
        (candidate.label
          ? docTypeMap[normalizeLabelForKey(candidate.label)] ?? null
          : null);

      const { error: updErr } = await supabase
        .from("cs_docs")
        .update({
          doc_name: jsonLabel,
          applicable_date: jsonDate,
          doc_type_id: resolvedDocTypeId,
          kaipoke_cs_id: candidate.kaipokeCsId ?? existing.kaipoke_cs_id,
          cs_documents_entry_id: candidate.jsonId ?? existing.cs_documents_entry_id,
        })
        .eq("id", existing.id);

      if (updErr) {
        result.errors.push({
          url: candidate.url,
          error: updErr.message,
        });
        result.ok = false;
        continue;
      }

      result.updatedMetaCount++;
    }

    // 7) 新規作成（ABBYY + OpenAI で OCR + 要約 + applicable_date 抽出 → cs_docs insert）
    for (const cand of analyzeTargets) {
      if (dryRun) continue;

      try {
        const analysis = await reanalyzeDocument(cand);

        if (!analysis) {
          result.errors.push({
            url: cand.url,
            error: "reanalyzeDocument returned null",
          });
          result.ok = false;
          continue;
        }

        const {
          ocrText,
          summary,
          applicableDate,
          docTypeId,
          docName,
          model,
          confidence,
        } = analysis;

        const resolvedDocTypeId =
          docTypeId ??
          cand.docTypeId ??
          (cand.label
            ? docTypeMap[normalizeLabelForKey(cand.label)] ?? null
            : null);

        const insertPayload = {
          url: cand.url,
          kaipoke_cs_id: cand.kaipokeCsId ?? null,
          cs_documents_entry_id: cand.jsonId ?? null,
          doc_type_id: resolvedDocTypeId,
          doc_name: docName ?? cand.label ?? null,
          ocr_text: ocrText ?? null,
          summary: summary ?? null,
          applicable_date:
            applicableDate ??
            (cand.acquiredAt ? cand.acquiredAt.slice(0, 10) : null),
          doc_date_raw: cand.acquiredAt ?? null,
          llm_model: model ?? null,
          classification_confidence: confidence ?? null,
          meta: {}, // 必要に応じて拡張
        };

        const { error: insErr } = await supabase
          .from("cs_docs")
          .insert(insertPayload);

        if (insErr) {
          result.errors.push({
            url: cand.url,
            error: insErr.message,
          });
          result.ok = false;
          continue;
        }

        result.analyzedCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push({ url: cand.url, error: msg });
        result.ok = false;
      }
    }

    if (verbose) {
      console.log("[fax_re_ocr] finished:", result);
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[fax_re_ocr] fatal error:", msg);
    result.ok = false;
    result.errors.push({ url: "", error: msg });
    return result;
  }
}

/**
 * 1件の PDF ドキュメントを再解析して
 * - ocrText
 * - summary
 * - applicableDate
 * を取得する。
 *
 * doc_type_id / doc_name は ④の要件に合わせて
 * - JSON 側に既に入っている場合はそちら優先
 * - ここでは「再分類までは行わない」方針（⑤で強化予定）
 */
// もともとのシグネチャはそのまま利用
async function reanalyzeDocument(candidate: CandidateDoc): Promise<{
  ocrText: string | null;
  summary: string | null;
  applicableDate: string | null; // 'YYYY-MM-DD'
  docTypeId: string | null;
  docName: string | null;
  model: string | null;
  confidence: number | null;
} | null> {
  const fileUrl = candidate.url;

  if (!ABBYY_APPLICATION_ID || !ABBYY_API_KEY || !ABBYY_END_POINT) {
    console.warn(
      "[fax_re_ocr] ABBYY env missing; skip analysis for:",
      fileUrl,
    );
    return null;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[fax_re_ocr] OPENAI_API_KEY missing; skip analysis for:",
      fileUrl,
    );
    return null;
  }

  try {
    // 1) PDF を取得
    const pdfRes = await fetch(fileUrl);
    if (!pdfRes.ok) {
      throw new Error(
        `fetch PDF failed: ${pdfRes.status} ${pdfRes.statusText}`,
      );
    }
    const pdfArrayBuffer = await pdfRes.arrayBuffer();

    // 2) ABBYY で先頭1ページを OCR
    const ocrText = await ocrWithAbbyyFirstPage(pdfArrayBuffer);
    if (!ocrText || !ocrText.trim()) {
      throw new Error("OCR text is empty");
    }

    // 3) OpenAI で要約 + applicable_date 抽出
    const { summary, applicableDate, confidence } =
      await summarizeAndExtractDate(ocrText);

    return {
      ocrText,
      summary,
      applicableDate,
      // ④では再分類はしない（既存の doc_type_id / label を優先）
      docTypeId: candidate.docTypeId ?? null,
      docName: candidate.label ?? null,
      model: "gpt-4.1-mini",
      confidence,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    console.error("[fax_re_ocr] reanalyzeDocument failed:", {
      url: fileUrl,
      error: msg,
    });

    // ★ここが B 案：
    // ABBYY / OpenAI の失敗時でも cs_docs に 1 行は作る。
    // ocr_result は null、sum_result に「OCR_FAILED: ...」を入れておく。
    return {
      ocrText: null,
      summary: `OCR_FAILED: ${msg}`.slice(0, 2000), // 長すぎ防止
      applicableDate: null,
      docTypeId: candidate.docTypeId ?? null,
      docName: candidate.label ?? null,
      model: null,
      confidence: null,
    };
  }
}

/**
 * ABBYY: 先頭1ページだけ OCR
 * GAS の extractTextFromPdfByAbbyyFirstPage 相当（簡略版）
 */
async function ocrWithAbbyyFirstPage(
  pdfArrayBuffer: ArrayBuffer,
): Promise<string> {
  if (!ABBYY_END_POINT || !ABBYY_APPLICATION_ID || !ABBYY_API_KEY) {
    throw new Error("ABBYY env vars are not set");
  }

  // ABBYY_END_POINT は
  //  - https://cloud-westus.ocrsdk.com
  //  - または https://cloud-westus.ocrsdk.com/processImage
  // のどちらでも動くようにする
  const rawBase = ABBYY_END_POINT.replace(/\/$/, "");
  let PROCESS_URL: string;
  let STATUS_URL: string;

  if (/\/processImage$/i.test(rawBase)) {
    // すでに processImage まで含まれているパターン（GAS と同じ）
    PROCESS_URL = rawBase;
    STATUS_URL = rawBase.replace(/\/processImage$/i, "/getTaskStatus");
  } else {
    // ベース URL パターン
    PROCESS_URL = `${rawBase}/processImage`;
    STATUS_URL = `${rawBase}/getTaskStatus`;
  }

  const authHeader =
    "Basic " +
    Buffer.from(`${ABBYY_APPLICATION_ID}:${ABBYY_API_KEY}`).toString("base64");

  // （ここから下は既存ロジックを使い回し）
  // もし前に追加した「ページ数判定 → pageRange」ロジックがあればここに置く
  // 例:
  //
  const pageCount = estimatePdfPageCount(pdfArrayBuffer);
  const usePageRange = pageCount >= 10 ? "1-1" : null;
  //
  const form = new FormData();
  const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
  form.set("language", "japanese");
  form.set("exportFormat", "txt");
  if (usePageRange) {
    form.set("pageRange", usePageRange);
  }
  form.set("file", blob, "input.pdf");

  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
    body: form,
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `ABBYY processImage error ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  const taskIdMatch = body.match(/task id="([^"]+)"/);
  if (!taskIdMatch) {
    throw new Error("ABBYY response has no task id");
  }
  const taskId = taskIdMatch[1];
  const statusUrl = `${STATUS_URL}?taskId=${encodeURIComponent(taskId)}`;

  let lastStatus = "Unknown";
  let resultUrl: string | null = null;

  for (let i = 0; i < 10; i++) {
    await sleep(2000);

    const stRes = await fetch(statusUrl, {
      method: "GET",
      headers: {
        Authorization: authHeader,
      },
    });
    const stBody = await stRes.text();

    if (!stRes.ok) {
      throw new Error(
        `ABBYY getTaskStatus error ${stRes.status}: ${stBody.slice(0, 200)}`,
      );
    }

    const statusMatch = stBody.match(/status="([^"]+)"/);
    lastStatus = statusMatch ? statusMatch[1] : "Unknown";

    if (lastStatus === "Completed") {
      const resultMatch = stBody.match(/resultUrl="([^"]+)"/);
      if (!resultMatch) {
        throw new Error("ABBYY Completed but no resultUrl");
      }
      resultUrl = resultMatch[1];
      break;
    }
    if (lastStatus === "ProcessingFailed") {
      throw new Error("ABBYY OCR ProcessingFailed");
    }
  }


  if (!resultUrl) {
    throw new Error(`ABBYY OCR timeout; last status = ${lastStatus}`);
  }

  const txtRes = await fetch(resultUrl);
  if (!txtRes.ok) {
    throw new Error(
      `ABBYY result fetch error ${txtRes.status}: ${await txtRes.text()}`,
    );
  }

  const text = await txtRes.text();
  return text.normalize("NFKC");
}

/**
 * OpenAI で OCRテキストを要約しつつ、適用日(applicable_date)を抽出
 * - summary: 文書の要約（日本語）
 * - applicable_date: "YYYY-MM-DD" or null
 */
async function summarizeAndExtractDate(ocrText: string): Promise<{
  summary: string;
  applicableDate: string | null;
  confidence: number | null;
}> {
  const truncated = ocrText.slice(0, 8000);

  const systemPrompt =
    "あなたは介護・障害福祉サービス関連の文書を読み取り、要約と重要日付の抽出を行う専門AIです。";

  const userPrompt = [
    "以下はFAXやDigiサイン等からOCRしたテキストです。",
    "この文書が契約書・計画書・モニタリング等であると想定して、",
    "次の情報をJSON形式で返してください。",
    "",
    "【求めるJSON形式】",
    "{",
    '  "summary": string,            // 文書全体の要約（日本語、最大400文字程度）',
    '  "applicable_date": string|null, // 契約日・開始日・基準日など、この文書の起点となる日付（YYYY-MM-DD）。不明なら null。',
    '  "confidence": number          // applicable_date が正しいという自信度（0〜100）',
    "}",
    "",
    "【applicable_date の決め方】",
    "- 契約書なら「契約日」「契約開始日」など、最初の開始日を優先してください。",
    "- 計画書やプランなら「計画期間の開始日」を優先してください。",
    "- モニタリング等で基準となる日付が明示されている場合はその日付。",
    "- 複数候補がある場合は、訪問介護・居宅介護にとって一番重要と思われる日付を1つ選んでください。",
    "- 日付が全く読み取れない場合は null を返してください。",
    "",
    "【重要】",
    "- 出力は厳密な JSON だけにしてください（説明文やコメントは付けない）。",
    "- 日付は必ず YYYY-MM-DD 形式で返してください。",
    "",
    "---- OCRテキストここから ----",
    truncated,
    "---- OCRテキストここまで ----",
  ].join("\n");

  const chatRes = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = chatRes.choices[0]?.message?.content ?? "";
  const jsonStr = extractJsonFromText(content);

  let parsed: OcrSummaryJson;
  try {
    parsed = JSON.parse(jsonStr) as OcrSummaryJson;
  } catch {
    // 失敗したら summary だけでも返す
    return {
      summary: content.slice(0, 1000),
      applicableDate: null,
      confidence: null,
    };
  }

  const summary =
    typeof parsed.summary === "string"
      ? parsed.summary
      : content.slice(0, 1000);

  const applicableDate =
    typeof parsed.applicable_date === "string"
      ? parsed.applicable_date
      : null;

  const confidence =
    typeof parsed.confidence === "number" ? parsed.confidence : null;

  return { summary, applicableDate, confidence };
}


/**
 * PDF のページ数をざっくり推定する
 * - /Type /Page の出現回数を数える簡易版
 * - 失敗したら 1 ページ扱い
 */
function estimatePdfPageCount(pdfArrayBuffer: ArrayBuffer): number {
  try {
    const text = Buffer.from(pdfArrayBuffer).toString("latin1");
    const matches = text.match(/\/Type\s*\/Page\b/g);
    if (matches && matches.length > 0) {
      return matches.length;
    }
  } catch (e) {
    console.warn("[fax_re_ocr] estimatePdfPageCount failed:", e);
  }
  return 1;
}


/**
 * OpenAI の返答から JSON 部分だけを取り出す簡易ヘルパー
 */
function extractJsonFromText(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("no JSON object found in OpenAI response");
  }
  return text.slice(first, last + 1);
}


