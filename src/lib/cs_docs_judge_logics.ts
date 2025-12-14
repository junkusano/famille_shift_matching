// src/lib/cs_docs_judge_logics.ts
import { supabaseAdmin } from "@/lib/supabase/service";

/* =========================================================
 * Types
 * ========================================================= */

export type Mode = "full" | "incremental";

type MasterRow = {
  id: string;
  label: string;
  category: string;
  is_active: boolean;
};

type CsDocRowLite = {
  doc_type_id: string | null;
};

type CsDocSample = {
  id: string;
  url: string;
  source: string;
  doc_name: string | null;
  ocr_text: string | null;
  summary: string | null;
  applicable_date: string | null; // date
  updated_at: string; // timestamptz
};

export type FeaturesJson = {
  keywords: {
    positive: Array<{ term: string; score: number; evidence?: string }>;
    negative: Array<{ term: string; score: number; evidence?: string }>;
  };
  regex: {
    positive: Array<{ pattern: string; score: number; evidence?: string }>;
    negative: Array<{ pattern: string; score: number; evidence?: string }>;
  };
  section_headers: {
    positive: Array<{ term: string; score: number; evidence?: string }>;
    negative: Array<{ term: string; score: number; evidence?: string }>;
  };
  source_hints: Array<{ source: string; weight: number }>;
};

export type JudgeLogicsV2 = {
  version: 2;
  generated_at: string;
  window_hours: number;
  mode: Mode;
  stats: {
    total_docs: number;
    recent_docs: number;
    top_sources: Array<{ source: string; count: number }>;
    applicable_date_range: { min: string | null; max: string | null };
    doc_name_samples: string[];
    url_samples: string[];
  };
  features: FeaturesJson;
  notes: string[];
};

type Skipped = Array<{ docTypeId: string; reason: string }>;

/* =========================================================
 * Helpers
 * ========================================================= */

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(x: unknown, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function uniqKeepOrder(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

function topCounts(values: string[], topN: number): Array<{ source: string; count: number }> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([source, count]) => ({ source, count }));
}

function normalizeLoose(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function isFeaturesJson(x: unknown): x is FeaturesJson {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (!o.keywords || !o.regex || !o.section_headers || !o.source_hints) return false;
  return true;
}

function sinceIsoFromHours(windowHours: number): string {
  const ms = windowHours * 3600 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

/* =========================================================
 * Debug: window stats (DB違い/時刻ズレの切り分け)
 * ========================================================= */

type WindowStats = {
  windowHours: number;
  sinceIso: string;
  maxUpdatedAt: string | null;
  rowsFetched: number;
  distinctDocTypes: number;
  sampleDocTypeIds: string[];
};

async function getWindowStats(windowHours: number): Promise<WindowStats> {
  const sinceIso = sinceIsoFromHours(windowHours);

  // 最新1件の updated_at（DB側の値を見るため）
  const { data: latest, error: latestErr } = await supabaseAdmin
    .from("cs_docs")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (latestErr) {
    console.log("[cs-docs-judge-logics][debug] latestErr", { msg: latestErr.message });
  }

  // 直近windowHoursの doc_type_id を最大5000件取得して distinct を数える
  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from("cs_docs")
    .select("doc_type_id,updated_at")
    .not("doc_type_id", "is", null)
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(5000);

  if (rowsErr) {
    console.log("[cs-docs-judge-logics][debug] rowsErr", { msg: rowsErr.message, sinceIso });
    return {
      windowHours,
      sinceIso,
      maxUpdatedAt: (latest?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null,
      rowsFetched: 0,
      distinctDocTypes: 0,
      sampleDocTypeIds: [],
    };
  }

  const ids = (rows ?? [])
    .map((r) => (r as { doc_type_id: string | null }).doc_type_id)
    .filter((v): v is string => !!v);

  const distinct = new Set(ids);

  const stats: WindowStats = {
    windowHours,
    sinceIso,
    maxUpdatedAt: (latest?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null,
    rowsFetched: ids.length,
    distinctDocTypes: distinct.size,
    sampleDocTypeIds: [...distinct].slice(0, 10),
  };

  console.log("[cs-docs-judge-logics][debug] windowStats", stats);
  return stats;
}

/* =========================================================
 * LLM Call (TEMP: returns minimal valid JSON)
 * ========================================================= */

async function callLLM({ system, user }: { system: string; user: string }): Promise<string> {
  // eslint/no-unused-vars 対策
  void system;
  void user;

  // ✅ v2が必ず通る「最低限の形」
  return JSON.stringify({
    keywords: { positive: [], negative: [] },
    regex: { positive: [], negative: [] },
    section_headers: { positive: [], negative: [] },
    source_hints: [],
  });
}

/* =========================================================
 * Prompt builder (v2 features)
 * ========================================================= */

function buildFeaturePrompt(docSamples: Array<Pick<CsDocSample, "source" | "doc_name" | "ocr_text" | "summary">>) {
  const system =
    "You are a strict JSON generator. Output MUST be a single valid JSON object and nothing else. No markdown. No code fences. No comments. No trailing commas.";

  const user = `あなたは訪問介護/障害福祉の書類分類ロジック担当です。
次の「正解ラベル付き（doc_type_idが付いた）」文書群から、この書類タイプを判定するための特徴を抽出してください。

目的：
- 書類名(doc_name)が欠けていても判定できる特徴を作る
- OCR/summaryに出る“固有語・見出し・数値ラベル”を中心にする
- 似た書類との誤判定を減らすため negative 特徴も作る

出力は JSON のみ。スキーマ：
{
  "keywords": { "positive":[{"term":string,"score":number,"evidence":string?}], "negative":[...] },
  "regex": { "positive":[{"pattern":string,"score":number,"evidence":string?}], "negative":[...] },
  "section_headers": { "positive":[{"term":string,"score":number,"evidence":string?}], "negative":[...] },
  "source_hints": [{"source":string,"weight":number}]
}

制約：
- positive keywords は 10〜25個、negative keywords は 5〜15個
- regex は positive 3〜10個（あれば）、section_headersは positive 3〜12個（あれば）
- scoreは0.1〜3.0
- evidence は短い引用（20文字程度まで）でよい。なければ省略可
- source_hints の weight は 0.2〜1.2

入力データ（最大N件のサンプル）：
${JSON.stringify(docSamples)}
`;

  return { system, user };
}

/* =========================================================
 * 1) Backfill: cs_docs.doc_type_id by doc_name (= master.label)
 * ========================================================= */

export async function backfillDocTypeIdByDocName(params: {
  mode: Mode;
  windowHours: number;
  limitDocs: number; // 0=無制限（ただし最大5000に抑える）
}): Promise<{ inspected: number; filled: number; unmatchedSamples: string[] }> {
  const { mode, windowHours, limitDocs } = params;

  const { data: masters, error: mErr } = await supabaseAdmin
    .from("user_doc_master")
    .select("id,label,category,is_active")
    .eq("category", "cs_doc")
    .eq("is_active", true);

  if (mErr) throw mErr;

  const dict = new Map<string, string>();
  for (const m of (masters ?? []) as MasterRow[]) {
    dict.set(normalizeLoose(m.label), m.id);
  }

  let q = supabaseAdmin
    .from("cs_docs")
    .select("id,doc_name,updated_at")
    .is("doc_type_id", null)
    .not("doc_name", "is", null);

  if (mode === "incremental") {
    q = q.gte("updated_at", sinceIsoFromHours(windowHours));
  }

  const max = limitDocs > 0 ? Math.min(limitDocs, 5000) : 5000;

  const { data: docs, error: dErr } = await q.order("updated_at", { ascending: false }).limit(max);
  if (dErr) throw dErr;

  const rows = (docs ?? []) as Array<{ id: string; doc_name: string | null }>;
  let filled = 0;
  const unmatched: string[] = [];

  for (const r of rows) {
    const name = normalizeLoose(r.doc_name ?? "");
    const docTypeId = dict.get(name);
    if (!docTypeId) {
      if (name && unmatched.length < 20) unmatched.push(name);
      continue;
    }

    const { data: upd, error: uErr } = await supabaseAdmin
      .from("cs_docs")
      .update({ doc_type_id: docTypeId })
      .eq("id", r.id)
      .is("doc_type_id", null)
      .select("id");

    if (uErr) throw uErr;
    if (upd) filled += upd.length;
  }

  console.log("[cs-docs-judge-logics][backfill] result", {
    mode,
    windowHours,
    inspected: rows.length,
    filled,
    unmatchedSamples: unmatched.slice(0, 10),
  });

  return { inspected: rows.length, filled, unmatchedSamples: unmatched };
}

/* =========================================================
 * 2) Judge logics v2 (features by LLM)
 * ========================================================= */

function sanitizeFeatures(features: FeaturesJson): FeaturesJson {
  const sanitizeTerms = (arr: Array<{ term: string; score: number; evidence?: string }>) =>
    arr
      .map((x) => ({
        term: normalizeLoose(String(x.term ?? "")),
        score: clamp(safeNumber(x.score, 0.5), 0.1, 3.0),
        evidence: x.evidence ? String(x.evidence).slice(0, 40) : undefined,
      }))
      .filter((x) => x.term.length > 0)
      .slice(0, 60);

  const sanitizePatterns = (arr: Array<{ pattern: string; score: number; evidence?: string }>) =>
    arr
      .map((x) => ({
        pattern: normalizeLoose(String(x.pattern ?? "")),
        score: clamp(safeNumber(x.score, 0.5), 0.1, 3.0),
        evidence: x.evidence ? String(x.evidence).slice(0, 40) : undefined,
      }))
      .filter((x) => x.pattern.length > 0)
      .slice(0, 60);

  const sanitizeSources = (arr: Array<{ source: string; weight: number }>) =>
    arr
      .map((x) => ({
        source: normalizeLoose(String(x.source ?? "")),
        weight: clamp(safeNumber(x.weight, 0.7), 0.2, 1.2),
      }))
      .filter((x) => x.source.length > 0)
      .slice(0, 30);

  return {
    keywords: {
      positive: sanitizeTerms(features.keywords?.positive ?? []),
      negative: sanitizeTerms(features.keywords?.negative ?? []),
    },
    regex: {
      positive: sanitizePatterns(features.regex?.positive ?? []),
      negative: sanitizePatterns(features.regex?.negative ?? []),
    },
    section_headers: {
      positive: sanitizeTerms(features.section_headers?.positive ?? []),
      negative: sanitizeTerms(features.section_headers?.negative ?? []),
    },
    source_hints: sanitizeSources(features.source_hints ?? []),
  };
}

export async function rebuildJudgeLogicsV2ForDocTypes(params: {
  mode: Mode;
  windowHours: number;
  limitDocTypes: number; // 0=無制限
  samplePerDocType: number; // 例: 30
}): Promise<{ updated: number; targetDocTypeIds: string[]; skipped: Skipped }> {
  const { mode, windowHours, limitDocTypes, samplePerDocType } = params;

  let q = supabaseAdmin.from("cs_docs").select("doc_type_id").not("doc_type_id", "is", null);

  // ✅ incremental だけ windowで絞る
  if (mode === "incremental") q = q.gte("updated_at", sinceIsoFromHours(windowHours));

  const { data: dtRows, error: dtErr } = await q;
  if (dtErr) throw dtErr;

  const allIds = uniqKeepOrder(
    (dtRows ?? [])
      .map((r) => (r as CsDocRowLite).doc_type_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0),
    5000
  );

  const target = limitDocTypes > 0 ? allIds.slice(0, limitDocTypes) : allIds;

  let updated = 0;
  const skipped: Skipped = [];

  console.log("[cs-docs-judge-logics][v2] targets", { targetCount: target.length, mode, windowHours });

  for (const docTypeId of target) {
    const { data: docs, error: dErr } = await supabaseAdmin
      .from("cs_docs")
      .select("id,url,source,doc_name,ocr_text,summary,applicable_date,updated_at")
      .eq("doc_type_id", docTypeId)
      .order("updated_at", { ascending: false })
      .limit(samplePerDocType);

    if (dErr) throw dErr;

    const rows = (docs ?? []) as CsDocSample[];
    if (rows.length === 0) {
      skipped.push({ docTypeId, reason: "no_samples" });
      continue;
    }

    const sources = rows.map((r) => r.source);
    const topSources = topCounts(sources, 10);

    const applicableDates = rows.map((r) => r.applicable_date).filter((v): v is string => !!v);
    const minDate = applicableDates.length ? applicableDates.slice().sort()[0] : null;
    const maxDate = applicableDates.length ? applicableDates.slice().sort().reverse()[0] : null;

    const docNameSamples = uniqKeepOrder(
      rows.map((r) => r.doc_name ?? "").filter((v) => v.trim().length > 0),
      20
    );
    const urlSamples = uniqKeepOrder(rows.map((r) => r.url), 10);

    const promptSamples = rows.map((r) => ({
      source: r.source,
      doc_name: r.doc_name,
      ocr_text: (r.ocr_text ?? "").slice(0, 5000),
      summary: (r.summary ?? "").slice(0, 3000),
    }));

    const { system, user } = buildFeaturePrompt(promptSamples);

    const raw = await callLLM({ system, user });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      skipped.push({ docTypeId, reason: "llm_json_parse_failed" });
      continue;
    }

    if (!isFeaturesJson(parsed)) {
      skipped.push({ docTypeId, reason: "llm_json_shape_invalid" });
      continue;
    }

    const features = sanitizeFeatures(parsed as FeaturesJson);

    const judgeLogics: JudgeLogicsV2 = {
      version: 2,
      generated_at: new Date().toISOString(),
      window_hours: windowHours,
      mode,
      stats: {
        total_docs: rows.length,
        recent_docs: mode === "incremental" ? rows.length : 0,
        top_sources: topSources,
        applicable_date_range: { min: minDate, max: maxDate },
        doc_name_samples: docNameSamples,
        url_samples: urlSamples,
      },
      features,
      notes: [
        "このサマリーは cs_docs の正解ラベル(doc_type_id)付きデータから自動生成されています。",
        "keywords/regex/section_headers は判定器（スコアリング）で利用する想定です。",
      ],
    };

    // ✅ updated_at も必ず動かす（「更新が無い」に見える問題を潰す）
    const nowIso = new Date().toISOString();

    const { data: updRows, error: updErr } = await supabaseAdmin
      .from("user_doc_master")
      .update({ judge_logics: judgeLogics, updated_at: nowIso })
      .eq("id", docTypeId)
      .select("id");

    if (updErr) throw updErr;

    const updatedRows = updRows?.length ?? 0;

    console.log("[cs-docs-judge-logics][v2] update", {
      docTypeId,
      sampleCount: rows.length,
      updatedRows,
    });

    if (updatedRows === 0) {
      skipped.push({ docTypeId, reason: "user_doc_master_update_0" });
      continue;
    }

    updated += updatedRows;
  }

  console.log("[cs-docs-judge-logics][v2] finished", {
    updated,
    skippedCount: skipped.length,
    skippedTop: skipped.slice(0, 10),
  });

  return { updated, targetDocTypeIds: target, skipped };
}

/* =========================================================
 * 3) Runner for cron (debug -> backfill -> v2)
 * ========================================================= */

export async function runCsDocsJudgeLogicsCron(params: {
  mode: Mode;
  windowHours: number;
  backfillLimitDocs: number;
  limitDocTypes: number; // 0=無制限
  samplePerDocType: number;
}): Promise<{
  debug: { windowStats: WindowStats };
  backfill: { inspected: number; filled: number; unmatchedSamples: string[] };
  rebuildV2: { updated: number; targetDocTypeIds: string[]; skipped: Skipped };
}> {
  // ✅ ここで「この関数が見てるDBの直近windowHours統計」を確定させる
  const windowStats = await getWindowStats(params.windowHours);

  const backfill = await backfillDocTypeIdByDocName({
    mode: params.mode,
    windowHours: params.windowHours,
    limitDocs: params.backfillLimitDocs,
  });

  const rebuildV2 = await rebuildJudgeLogicsV2ForDocTypes({
    mode: params.mode,
    windowHours: params.windowHours,
    limitDocTypes: params.limitDocTypes,
    samplePerDocType: params.samplePerDocType,
  });

  return { debug: { windowStats }, backfill, rebuildV2 };
}
