// src/lib/cs_docs.ts
import { supabaseAdmin as supabase } from "@/lib/supabase/service";

/* ========== 型定義 ========== */

export type CsDocRow = {
  id: string;
  url: string | null;

  // 利用者
  kaipoke_cs_id: string | null; // 業務キー（テキスト）
  cs_kaipoke_info_id: string | null; // cs_kaipoke_info.id（uuid）
  applicable_date: string | null;
  source: string | null;
  doc_name: string | null;
  ocr_text: string | null;
  summary: string | null;
  doc_date_raw: string | null; // timestamp with tz を文字列で受ける
  created_at: string | null;
};

export type CsKaipokeInfo = {
  id: string;
  kaipoke_cs_id: string;
  name: string | null;
  kana: string | null;
};

export type CsDocsInitialData = {
  docs: CsDocRow[];
  kaipokeList: CsKaipokeInfo[];
  totalCount: number;
  page: number;
  perPage: number;
};

export const UNCLASSIFIED_DOC_NAME = "分類不能";

export type CsDocsFilters = {
  kaipokeCsId?: string | null;
  unassignedOnly?: boolean;
  keyword?: string | null;
  unclassifiedOnly?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type CsDocsQuery = CsDocsFilters & {
  page?: number;
  perPage?: number;
};

const UNASSIGNED_CLIENT_FILTER =
  'kaipoke_cs_id.is.null,kaipoke_cs_id.eq."",cs_kaipoke_info_id.is.null';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanTextParam(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*");
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildOcrSummaryKeywordFilter(keyword: string): string {
  const pattern = `*${escapeLikePattern(keyword)}*`;
  const quotedPattern = quotePostgrestValue(pattern);
  return `ocr_text.ilike.${quotedPattern},summary.ilike.${quotedPattern}`;
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toUtcDayStart(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

function toNextUtcDayStart(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  return `${nextDate.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

/* ========== 一覧取得 ========== */

export async function getCsDocsInitialData(
  params: CsDocsQuery = {}
): Promise<CsDocsInitialData> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const perPage = params.perPage && params.perPage > 0 ? params.perPage : 50;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let q = supabase
    .from("cs_docs")
    .select(
      `
      id,
      url,
      kaipoke_cs_id,
      cs_kaipoke_info_id,
      source,
      doc_name,
      ocr_text,
      summary,
      applicable_date, 
      doc_date_raw,
      created_at
    `,
      { count: "exact" }
    );

  const kaipokeCsId = cleanTextParam(params.kaipokeCsId);
  const keyword = cleanTextParam(params.keyword);
  const dateFrom = cleanTextParam(params.dateFrom);
  const dateTo = cleanTextParam(params.dateTo);

  if (kaipokeCsId) {
    q = q.eq("kaipoke_cs_id", kaipokeCsId);
  }

  if (params.unassignedOnly) {
    q = q.or(UNASSIGNED_CLIENT_FILTER);
  }

  if (keyword) {
    q = q.or(buildOcrSummaryKeywordFilter(keyword));
  }

  if (params.unclassifiedOnly) {
    q = q.eq("doc_name", UNCLASSIFIED_DOC_NAME);
  }

  if (isValidDateOnly(dateFrom)) {
    q = q.gte("doc_date_raw", toUtcDayStart(dateFrom));
  }

  if (isValidDateOnly(dateTo)) {
    q = q.lt("doc_date_raw", toNextUtcDayStart(dateTo));
  }

  const { data: docs, error: docsErr, count } = await q
    .order("created_at", { ascending: false })
    .order("doc_date_raw", { ascending: false })
    .range(from, to);

  if (docsErr) throw new Error(`cs_docs 取得エラー: ${docsErr.message}`);

  const { data: kaipokeList, error: kaipokeErr } = await supabase
    .from("cs_kaipoke_info")
    .select("id, kaipoke_cs_id, name, kana") // ★ kana追加
    .eq("is_active", true)
    .order("kana", { ascending: true })     // ★ kana昇順
    .order("name", { ascending: true })     // 同かなの時の安定化（任意）
    .order("kaipoke_cs_id", { ascending: true }); // さらに安定化（任意）


  if (kaipokeErr) throw new Error(`cs_kaipoke_info 取得エラー: ${kaipokeErr.message}`);

  return {
    docs: (docs ?? []) as CsDocRow[],
    kaipokeList: (kaipokeList ?? []) as CsKaipokeInfo[],
    totalCount: count ?? 0,
    page,
    perPage,
  };
}

/* ========== 更新/削除（APIから呼ぶ想定） ========== */

export type UpdateCsDocInput = {
  id: string;
  // 変更前の利用者（documents同期のため）
  prev_kaipoke_cs_id: string | null;
  url: string | null;
  kaipoke_cs_id: string | null;
  source: string; // NOT NULL
  doc_name: string | null;
  doc_date_raw: string | null; // "YYYY-MM-DD" or ISO or null
  ocr_text: string | null;
  summary: string | null;
};

function toTimestampOrNull(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (s === "") return null;

  // "YYYY-MM-DD" は timestamp にする（UTC 0:00）
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;

  // それ以外はそのまま（ISO等）
  return s;
}

export async function updateCsDocAndSync(input: UpdateCsDocInput): Promise<CsDocRow> {
  const payload = {
    kaipoke_cs_id: input.kaipoke_cs_id,
    source: input.source,
    doc_name: input.doc_name,
    doc_date_raw: toTimestampOrNull(input.doc_date_raw),
    ocr_text: input.ocr_text,
    summary: input.summary,
  };

  // まず cs_docs 更新（update後の行を返す）
  const { data: updated, error: updErr } = await supabase
    .from("cs_docs")
    .update(payload)
    .eq("id", input.id)
    .select(
      `
      id,
      url,
      kaipoke_cs_id,
      cs_kaipoke_info_id,
      source,
      doc_name,
      ocr_text,
      summary,
      applicable_date,
      doc_date_raw,
      created_at
    `
    )
    .single();

  if (updErr) throw new Error(`cs_docs 更新エラー: ${updErr.message}`);

  // documents 同期（best-effort）
  // 「移動」を考慮して prev と new の両方を更新対象にする
  // ※ URL一致の既存レコードを更新するだけ（新規追加はしない）
  const targets = new Set<string>();
  if (input.prev_kaipoke_cs_id) targets.add(input.prev_kaipoke_cs_id);
  if (input.kaipoke_cs_id) targets.add(input.kaipoke_cs_id);

  const preferredDate = updated.applicable_date ?? updated.doc_date_raw ?? input.doc_date_raw ?? null;

  const syncUrl = updated.url ?? input.url ?? null;

  await Promise.all(
    [...targets].map((kaipokeId) =>
      syncCsDocToKaipokeDocuments({
        kaipoke_cs_id: kaipokeId,
        url: syncUrl,
        doc_name: input.doc_name,
        doc_date_raw: preferredDate,
      }).catch(() => { })
    )
  );


  return updated as CsDocRow;
}

export async function deleteCsDocById(id: string): Promise<void> {
  const { error } = await supabase.from("cs_docs").delete().eq("id", id);
  if (error) throw new Error(`cs_docs 削除エラー: ${error.message}`);
}

/* ========== documents 同期（best-effort） ========== */

type SyncInput = {
  kaipoke_cs_id: string;
  url: string | null;
  doc_name: string | null;
  doc_date_raw: string | null; // "YYYY-MM-DD"想定
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isJsonArray(v: unknown): v is Json[] {
  return Array.isArray(v);
}
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function normalizeDateOnly(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (s === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function syncCsDocToKaipokeDocuments(input: SyncInput): Promise<void> {
  const { kaipoke_cs_id, url, doc_name, doc_date_raw } = input;
  if (!kaipoke_cs_id || !url) return;

  const { data: info, error } = await supabase
    .from("cs_kaipoke_info")
    .select("id, documents")
    .eq("kaipoke_cs_id", kaipoke_cs_id)
    .maybeSingle();

  if (error) throw new Error(`cs_kaipoke_info 取得エラー: ${error.message}`);
  if (!info) return;

  const rawDocs = (info as unknown as Record<string, unknown>)["documents"];
  if (!isJsonArray(rawDocs)) return;

  const dateOnly = normalizeDateOnly(doc_date_raw);

  const nextDocs = rawDocs.map((d) => {
    if (!isRecord(d)) return d;

    const dUrl = asString(d["url"]);
    if (!dUrl || dUrl !== url) return d;

    const next: Record<string, Json> = { ...(d as Record<string, Json>) };

    // documents の構造に合わせて更新（label/acquired_at が無いなら作る）
    if (doc_name) next["label"] = doc_name;
    if (dateOnly) next["acquired_at"] = dateOnly;

    return next as Json;
  });

  // 変化が無ければ更新しない
  // （ざっくり stringify 比較）
  if (JSON.stringify(rawDocs) === JSON.stringify(nextDocs)) return;

  const { error: updErr } = await supabase
    .from("cs_kaipoke_info")
    .update({ documents: nextDocs })
    .eq("id", info.id);

  if (updErr) throw new Error(`cs_kaipoke_info.documents 更新エラー: ${updErr.message}`);
}
