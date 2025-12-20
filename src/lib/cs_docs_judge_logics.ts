import { createClient } from "@supabase/supabase-js";

export type CronMode = "incremental" | "full";

export type CronParams = {
  mode: CronMode;
  windowHours: number;
  limitDocTypes: number; // 0 = all
  samplePerDocType: number;
  backfillLimitDocs: number;
};

type CsDocRow = {
  id: string;
  doc_type_id: string | null;
  ocr_text: string | null;
  summary: string | null;
  source: string | null;
  url: string | null;
  doc_name: string | null;
  applicable_date: string | null;
  doc_date_raw: string | null;
  created_at: string;
  updated_at: string;
};

type DocTypeAgg = {
  doc_type_id: string;
  cnt: number;
};

type BackfillResult = {
  mode: CronMode;
  windowHours: number;
  inspected: number;
  filled: number;
  unmatchedSamples: Array<{ cs_docs_id: string; reason: string }>;
};

type RebuildV2Result = {
  updated: number;
  targetDocTypeCount: number;
  skippedCount: number;
  skippedTop: Array<{ docTypeId: string; reason: string }>;
};

export type CronResult = {
  mode: CronMode;
  windowHours: number;
  limitDocTypes: number;
  samplePerDocType: number;
  backfillLimitDocs: number;
  backfill: BackfillResult;
  rebuildV2: RebuildV2Result;
  ms: number;
};

const LOG_PREFIX = "[cs-docs-judge-logics]";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase env missing (URL or SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

function nowIso() {
  return new Date().toISOString();
}

function clip(s: string, max = 2000): string {
  const t = (s || "").replace(/\r/g, "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "\n…(truncated)";
}

function safeJsonStringify(v: unknown) {
  try {
    return JSON.stringify(v);
  } catch {
    return "{}";
  }
}

/**
 * judge_logics の JSON（user_doc_master.judge_logics）を格納する型
 */
export type JudgeLogicsV2 = {
  version: 2;
  mode: CronMode;
  window_hours: number;
  notes: string[];
  generated_at: string;
  stats: {
    total_docs: number;
    recent_docs: number;
    top_sources: Array<{ source: string; count: number }>;
    url_samples: string[];
    doc_name_samples: string[];
    applicable_date_range: { min: string | null; max: string | null };
  };
  features: {
    keywords: { positive: string[]; negative: string[] };
    regex: { positive: string[]; negative: string[] };
    section_headers: { positive: string[]; negative: string[] };
    source_hints: string[];
  };
};

/**
 * LLM（OpenAI）で特徴抽出（V2）
 * - judge_logics.features を「空ではない」状態にする
 * - URLは一切参照しない。cs_docs.ocr_text（必要ならsummary）だけを材料にする
 *
 * 期待する戻り値：
 * {
 *   version: 2,
 *   features: {
 *     keywords: { positive: string[], negative: string[] },
 *     regex: { positive: string[], negative: string[] },
 *     section_headers: { positive: string[], negative: string[] },
 *     source_hints: string[]
 *   }
 * }
 */
async function callLLM(params: {
  label: string;
  docTypeId: string;
  sampleOcrTexts: string[]; // すでに長さ調整済み（各要素 0〜数千文字）
}): Promise<Pick<JudgeLogicsV2, "features">> {
  const { label, docTypeId, sampleOcrTexts } = params;

  // OpenAIキーが無ければフォールバック（最低限“空じゃない features”）
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";
  if (!apiKey) {
    return { features: buildFallbackFeatures({ label, sampleOcrTexts }) };
  }

  const model =
    process.env.OPENAI_MODEL_JUDGE_LOGICS ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";

  const system = [
    "あなたは日本語の介護・福祉書類をOCRテキストとして受け取り、",
    "『その書類種別を判定するために使える特徴（キーワード/見出し/正規表現ヒント）』を抽出する専門家です。",
    "重要：URLやファイル名は参照できない前提。OCR本文だけで考えてください。",
    "重要：features は必ず空配列にしないこと（各positive配列に最低3件以上）。",
    "重要：出力はJSONのみ。余計な説明文は禁止。",
  ].join("\n");

  const user = buildJudgeLogicsPromptV2({
    label,
    docTypeId,
    sampleOcrTexts,
  });

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: safeJsonStringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.warn("[cs-docs-judge-logics][llm] http error", resp.status, body.slice(0, 500));
    return { features: buildFallbackFeatures({ label, sampleOcrTexts }) };
  }

  const json = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    return { features: buildFallbackFeatures({ label, sampleOcrTexts }) };
  }

  try {
    const parsed = JSON.parse(content) as { features?: JudgeLogicsV2["features"] };
    const f = parsed.features;
    if (!f) return { features: buildFallbackFeatures({ label, sampleOcrTexts }) };

    const normalized = normalizeFeaturesV2(f, label);
    return { features: normalized };
  } catch (e) {
    console.warn("[cs-docs-judge-logics][llm] json parse failed", e);
    return { features: buildFallbackFeatures({ label, sampleOcrTexts }) };
  }
}

function normalizeFeaturesV2(
  f: JudgeLogicsV2["features"],
  label: string
): JudgeLogicsV2["features"] {
  const uniq = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const cleaned = arr
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .map((s) => s.replace(/\s+/g, " "));
    return Array.from(new Set(cleaned));
  };

  const out: JudgeLogicsV2["features"] = {
    keywords: {
      positive: uniq(f.keywords?.positive),
      negative: uniq(f.keywords?.negative),
    },
    regex: {
      positive: uniq(f.regex?.positive),
      negative: uniq(f.regex?.negative),
    },
    section_headers: {
      positive: uniq(f.section_headers?.positive),
      negative: uniq(f.section_headers?.negative),
    },
    source_hints: uniq(f.source_hints),
  };

  // ✅ 空配列は許さない（最低3件）
  const ensureMin = (arr: string[], seeds: string[]) => {
    const merged = Array.from(new Set([...arr, ...seeds].filter(Boolean)));
    return merged.slice(0, Math.max(3, arr.length));
  };

  // label由来のシード（表記ゆれのない“中核語”）
  const labelSeeds = buildLabelSeeds(label);

  out.keywords.positive = ensureMin(out.keywords.positive, labelSeeds);
  out.section_headers.positive = ensureMin(out.section_headers.positive, labelSeeds);
  out.regex.positive = ensureMin(out.regex.positive, labelSeeds.map(escapeForRegex));

  return out;
}

function buildLabelSeeds(label: string): string[] {
  const s = String(label || "").trim();
  if (!s) return ["書類", "計画", "日付"];

  // 例： "障害サービス計画書(障害プラン）" → ["障害サービス計画書", "障害プラン", ...]
  const seeds: string[] = [];

  // 括弧内も拾う
  const m = s.match(/^(.*?)[(（]([^()（）]+)[)）]\s*$/);
  if (m) {
    const left = m[1].trim();
    const inside = m[2].trim();
    if (left) seeds.push(left);
    if (inside) seeds.push(inside);
  } else {
    seeds.push(s);
  }

  // 汎用語も少し足す（全書類共通を避けつつ、最低保証）
  seeds.push("計画書", "証", "提供", "有効", "期限");

  return Array.from(new Set(seeds)).filter(Boolean).slice(0, 8);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFallbackFeatures(args: { label: string; sampleOcrTexts: string[] }): JudgeLogicsV2["features"] {
  const { label, sampleOcrTexts } = args;
  const joined = sampleOcrTexts.join("\n");
  const seeds = buildLabelSeeds(label);

  // 簡易：OCRに頻出する“それっぽい”単語を拾う（漢字/カタカナを含む連続文字）
  const cand = Array.from(joined.matchAll(/[一-龠々]+|[ァ-ヶー]{3,}/g)).map((m) => m[0]);
  const freq = new Map<string, number>();
  for (const w of cand) {
    if (w.length < 2) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([w]) => w);

  const pos = Array.from(new Set([...seeds, ...top])).slice(0, 12);

  return {
    keywords: { positive: pos.slice(0, 10), negative: [] },
    regex: { positive: pos.slice(0, 10).map(escapeForRegex), negative: [] },
    section_headers: { positive: pos.slice(0, 6), negative: [] },
    source_hints: [],
  };
}

function buildJudgeLogicsPromptV2(params: {
  label: string;
  docTypeId: string;
  sampleOcrTexts: string[];
}): string {
  const { label, docTypeId, sampleOcrTexts } = params;

  // OCRは個票ごとに “抜粋” で十分（長すぎると精度・コストが落ちる）
  const samples = sampleOcrTexts
    .filter(Boolean)
    .slice(0, 30)
    .map((t, i) => {
      const s = t.replace(/\r/g, "").trim();
      const clipText = s.length > 1200 ? s.slice(0, 1200) + "\n…(truncated)" : s;
      return `--- SAMPLE ${i + 1} ---\n${clipText}`;
    })
    .join("\n\n");

  return [
    `対象書類種別: ${label}`,
    `doc_type_id: ${docTypeId}`,
    "",
    "以下のSAMPLE群（OCR本文）だけを比較分析して、この書類を識別しやすい特徴を抽出してください。",
    "",
    "出力JSONスキーマ（厳守）:",
    "{",
    '  "features": {',
    '    "keywords": { "positive": string[], "negative": string[] },',
    '    "regex": { "positive": string[], "negative": string[] },',
    '    "section_headers": { "positive": string[], "negative": string[] },',
    '    "source_hints": string[]',
    "  }",
    "}",
    "",
    "抽出ルール:",
    "- keywords.positive: この書類でよく出るが、他書類では出にくい“識別語”を10〜20件。",
    "- keywords.negative: あるとこの書類“ではない”可能性が上がる語を0〜10件。",
    "- section_headers.positive: 見出しとして出やすい短い語を3〜10件（例: 『被保険者番号』『有効期間』など）。",
    "- regex.positive: OCRゆれに強いパターンを3〜10件。例：'被保険者\\s*番号' のように空白ゆれ許容。文字列は正規表現文字列として返す。",
    "- それぞれのpositive配列は必ず3件以上（空禁止）。",
    "- 個人名・住所・電話番号など個人情報に寄りすぎる特徴は入れない。",
    "",
    "SAMPLES:",
    samples || "(no samples)",
  ].join("\n");
}

/**
 * 直近 windowHours で doc_type_id が付いた cs_docs をdocType毎に集計
 */
async function listTargetDocTypes(params: CronParams): Promise<DocTypeAgg[]> {
  const supabase = getSupabaseAdmin();

  const windowHours = Math.max(1, params.windowHours || 1);
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  // doc_type_id がある、かつ updated_at がwindow内
  // ※SQLの方が簡単だが、ここはREST/JSで寄せる
  const { data, error } = await supabase
    .from("cs_docs")
    .select("doc_type_id")
    .not("doc_type_id", "is", null)
    .gte("updated_at", since);

  if (error) throw error;
  const arr = (data || []) as Array<{ doc_type_id: string }>;

  const map = new Map<string, number>();
  for (const r of arr) {
    const id = r.doc_type_id;
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + 1);
  }

  const list: DocTypeAgg[] = Array.from(map.entries()).map(([doc_type_id, cnt]) => ({
    doc_type_id,
    cnt,
  }));

  list.sort((a, b) => b.cnt - a.cnt);

  if (params.limitDocTypes > 0) return list.slice(0, params.limitDocTypes);
  return list;
}

/**
 * doc_type_id の master（user_doc_master）から label などを取得
 */
async function fetchDocTypeMaster(docTypeIds: string[]) {
  const supabase = getSupabaseAdmin();

  if (!docTypeIds.length) return new Map<string, { id: string; label: string }>();

  const { data, error } = await supabase
    .from("user_doc_master")
    .select("id,label,category,is_active")
    .in("id", docTypeIds)
    .eq("category", "cs_doc")
    .eq("is_active", true);

  if (error) throw error;

  const map = new Map<string, { id: string; label: string }>();
  for (const r of data || []) {
    map.set((r).id, { id: (r).id, label: (r).label || "" });
  }
  return map;
}

/**
 * doc_type_id ごとのサンプルcs_docsを取る（OCR本文メイン）
 */
async function fetchSampleDocsByDocType(params: CronParams, docTypeId: string): Promise<CsDocRow[]> {
  const supabase = getSupabaseAdmin();

  //const windowHours = Math.max(1, params.windowHours || 1);
  //const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  const base = supabase
    .from("cs_docs")
    .select(
      "id,doc_type_id,ocr_text,summary,source,url,doc_name,applicable_date,doc_date_raw,created_at,updated_at"
    )
    .eq("doc_type_id", docTypeId)
    .not("ocr_text", "is", null)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, params.samplePerDocType || 30));

  // ルール生成の材料は「直近N件」を常に使う（windowに縛らない）
  const { data, error } = await base;
  if (error) throw error;
  return (data || []) as CsDocRow[];
}

function summarizeStats(rows: CsDocRow[], recentSinceIso: string) {
  const total_docs = rows.length;

  const recent_docs = rows.filter((r) => r.updated_at >= recentSinceIso).length;

  const top_sources_map = new Map<string, number>();
  for (const r of rows) {
    const s = (r.source || "unknown").trim() || "unknown";
    top_sources_map.set(s, (top_sources_map.get(s) || 0) + 1);
  }
  const top_sources = Array.from(top_sources_map.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const url_samples = rows
    .map((r) => r.url || "")
    .filter(Boolean)
    .slice(0, 10);

  const doc_name_samples = rows
    .map((r) => r.doc_name || "")
    .filter(Boolean)
    .slice(0, 10);

  const dates = rows
    .map((r) => r.applicable_date || "")
    .filter(Boolean)
    .sort();

  const applicable_date_range =
    dates.length > 0
      ? { min: dates[0] || null, max: dates[dates.length - 1] || null }
      : { min: null, max: null };

  return { total_docs, recent_docs, top_sources, url_samples, doc_name_samples, applicable_date_range };
}

/**
 * V2 judge_logics を docType 単位で作って user_doc_master に保存
 */
async function rebuildJudgeLogicsV2ForDocTypes(params: CronParams): Promise<RebuildV2Result> {
  const supabase = getSupabaseAdmin();

  const windowHours = Math.max(1, params.windowHours || 1);
  const sinceIso = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  const targets = await listTargetDocTypes(params);
  console.info(`${LOG_PREFIX}[v2] targets`, {
    targetCount: targets.length,
    mode: params.mode,
    windowHours,
  });

  const docTypeIds = targets.map((t) => t.doc_type_id);
  const masterMap = await fetchDocTypeMaster(docTypeIds);

  let updated = 0;
  const skippedTop: Array<{ docTypeId: string; reason: string }> = [];
  let skippedCount = 0;

  for (const t of targets) {
    const docTypeId = t.doc_type_id;
    const master = masterMap.get(docTypeId);
    const label = master?.label || "(no label)";

    // サンプルOCRを取得
    const sampleDocs = await fetchSampleDocsByDocType(params, docTypeId);
    if (!sampleDocs.length) {
      skippedCount++;
      if (skippedTop.length < 20) skippedTop.push({ docTypeId, reason: "no sample docs (ocr_text missing or empty)" });
      continue;
    }

    const stats = summarizeStats(sampleDocs, sinceIso);

    // OCR本文は“URL参照なし”でそのまま材料にする
    const sampleOcrTexts = sampleDocs
      .map((r) => clip(r.ocr_text || "", 2500))
      .filter(Boolean);

    // ✅ LLMで features を生成（空禁止）
    const llm = await callLLM({ label, docTypeId, sampleOcrTexts });

    const judge: JudgeLogicsV2 = {
      version: 2,
      mode: params.mode,
      window_hours: windowHours,
      notes: [
        "このサマリーは cs_docs の正解ラベル(doc_type_id)付きデータから自動生成されています。",
        "keywords/regex/section_headers は判定器（スコアリング）で利用する想定です。",
      ],
      stats,
      features: llm.features,
      generated_at: nowIso(),
    };

    // user_doc_master に保存
    const { error } = await supabase
      .from("user_doc_master")
      .update({
        judge_logics: judge,
        updated_at: nowIso(),
      })
      .eq("id", docTypeId);

    if (error) {
      skippedCount++;
      if (skippedTop.length < 20) skippedTop.push({ docTypeId, reason: `update error: ${error.message}` });
      continue;
    }

    updated++;
    console.info(`${LOG_PREFIX}[v2] update`, {
      docTypeId,
      sampleCount: sampleDocs.length,
      updatedRows: 1,
    });
  }

  console.info(`${LOG_PREFIX}[v2] finished`, { updated, skippedCount, skippedTop });
  return {
    updated,
    targetDocTypeCount: targets.length,
    skippedCount,
    skippedTop,
  };
}

/**
 * backfill: cs_docs の doc_type_id 欠損を “既存情報から” 埋める（最小限）
 * - 今回の主眼ではないので、ここは既存ロジック温存（必要なら後で強化）
 */
async function backfillDocTypeId(params: CronParams): Promise<BackfillResult> {
  const supabase = getSupabaseAdmin();

  const windowHours = Math.max(1, params.windowHours || 1);
  const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

  // doc_type_idがnullで、ocr_textがある、更新がwindow内
  const { data, error } = await supabase
    .from("cs_docs")
    .select("id,doc_type_id,ocr_text,summary,updated_at")
    .is("doc_type_id", null)
    .not("ocr_text", "is", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, params.backfillLimitDocs || 5000));

  if (error) throw error;

  const rows = (data || []) as Array<Pick<CsDocRow, "id" | "doc_type_id" | "ocr_text" | "summary" | "updated_at">>;
  let inspected = 0;
  const filled = 0;
  const unmatchedSamples: Array<{ cs_docs_id: string; reason: string }> = [];

  for (const r of rows) {
    inspected++;

    // NOTE:
    // ここは今までの「何かしらのヒントでdoc_type_id推定」を入れる場所。
    // 現状は無理に埋めず、unmatched扱い（後で“judge_logics判定器”を実装して埋める）。
    unmatchedSamples.push({ cs_docs_id: r.id, reason: "doc_type_id backfill not implemented (v2 scorer pending)" });
  }

  return {
    mode: params.mode,
    windowHours,
    inspected,
    filled,
    unmatchedSamples: unmatchedSamples.slice(0, 20),
  };
}

/**
 * 外部公開：Cron本体
 */
export async function runCsDocsJudgeLogicsCron(params: CronParams): Promise<CronResult> {
  const started = Date.now();

  console.info(LOG_PREFIX, "start", {
    method: "GET",
    url: "(internal)",
    at: nowIso(),
  });

  const backfill = await backfillDocTypeId(params);
  console.info(`${LOG_PREFIX}[backfill] result`, backfill);

  const rebuildV2 = await rebuildJudgeLogicsV2ForDocTypes(params);

  const ms = Date.now() - started;
  const res: CronResult = {
    mode: params.mode,
    windowHours: params.windowHours,
    limitDocTypes: params.limitDocTypes,
    samplePerDocType: params.samplePerDocType,
    backfillLimitDocs: params.backfillLimitDocs,
    backfill,
    rebuildV2,
    ms,
  };

  console.info(LOG_PREFIX, "done", res);
  return res;
}
