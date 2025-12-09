// src/lib/cs_docs.ts
import { supabaseAdmin as supabase } from "@/lib/supabase/service";

/* ========== 型定義 ========== */

export type CsDocRow = {
  id: string;
  url: string | null;
  kaipoke_cs_id: string | null;
  source: string | null;
  doc_name: string | null;
  ocr_text: string | null;
  summary: string | null;
  doc_date_raw: string | null; // date / timestamp を文字列として扱う
  created_at: string | null;
};

export type CsKaipokeInfo = {
  id: string;
  kaipoke_cs_id: string;
  name: string;
};

export type CsDocsInitialData = {
  docs: CsDocRow[];
  kaipokeList: CsKaipokeInfo[];
  totalCount: number;
  page: number;
  perPage: number;
};

export type CsDocsQuery = {
  page?: number;
  perPage?: number;
  kaipokeCsId?: string | null;
};

/* ========== 内部ヘルパー：doc_date_raw を JSON 用 ISO に正規化 ========== */

function normalizeDocDateRawForJson(doc_date_raw: string | null): string | null {
  if (!doc_date_raw) return null;

  // "YYYY-MM-DD" の場合は日本時間 00:00:00 として扱う
  if (/^\d{4}-\d{2}-\d{2}$/.test(doc_date_raw)) {
    const d = new Date(`${doc_date_raw}T00:00:00+09:00`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // "YYYY-MM-DD HH:MM:SS" 系（スペース区切り）の場合は "T" に置き換えてからパース
  if (/^\d{4}-\d{2}-\d{2}\s/.test(doc_date_raw)) {
    const d = new Date(doc_date_raw.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const d = new Date(doc_date_raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();

  return null;
}

/* ========== 一覧取得（cs_docs + cs_kaipoke_info） ========== */

export async function getCsDocsInitialData(
  params: CsDocsQuery = {}
): Promise<CsDocsInitialData> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const perPage = params.perPage && params.perPage > 0 ? params.perPage : 50;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  // cs_docs 一覧
  let query = supabase
    .from("cs_docs")
    .select(
      `
      id,
      url,
      kaipoke_cs_id,
      source,
      doc_name,
      ocr_text,
      summary,
      doc_date_raw,
      created_at
    `,
      { count: "exact" }
    );

  if (params.kaipokeCsId) {
    query = query.eq("kaipoke_cs_id", params.kaipokeCsId);
  }

  const {
    data: docs,
    error: docsErr,
    count,
  } = await query
    .order("doc_date_raw", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (docsErr) {
    throw new Error(`cs_docs 取得エラー: ${docsErr.message}`);
  }

  // 利用者一覧（必要な列だけ：id, kaipoke_cs_id, name）
  const { data: kaipokeList, error: kaipokeErr } = await supabase
    .from("cs_kaipoke_info")
    .select("id, kaipoke_cs_id, name")
    .order("name", { ascending: true });

  if (kaipokeErr) {
    throw new Error(`cs_kaipoke_info 取得エラー: ${kaipokeErr.message}`);
  }

  return {
    docs: (docs ?? []) as CsDocRow[],
    kaipokeList: (kaipokeList ?? []) as CsKaipokeInfo[],
    totalCount: count ?? 0,
    page,
    perPage,
  };
}

/* ========== 更新 ========== */

export type UpdateCsDocInput = {
  id: string;
  url: string | null;
  kaipoke_cs_id: string | null;
  source: string | null;
  doc_name: string | null;
  ocr_text: string | null;
  summary: string | null;
  doc_date_raw: string | null; // "YYYY-MM-DD" or null
};

export async function updateCsDocById(input: UpdateCsDocInput): Promise<void> {
  const { id, ...fields } = input;

  const { error } = await supabase
    .from("cs_docs")
    .update(fields)
    .eq("id", id);

  if (error) {
    throw new Error(`cs_docs 更新エラー: ${error.message}`);
  }
}

/* ========== cs_kaipoke_info.documents との同期 ========== */

type SyncCsDocToKaipokeInput = {
  url: string | null;
  kaipoke_cs_id: string | null;
  doc_name: string | null;
  doc_date_raw: string | null;
};

/**
 * cs_docs の 1 行分の情報を、対応する cs_kaipoke_info.documents に best-effort で反映する。
 * ・kaipoke_cs_id と url が両方ある場合のみ動作
 * ・documents[].url が一致するレコードの label / acquired_at を更新
 * ・該当行がない場合は何もしない（新規追加はしない）
 */
export async function syncCsDocToKaipokeDocuments(
  input: SyncCsDocToKaipokeInput
): Promise<void> {
  const { url, kaipoke_cs_id, doc_name, doc_date_raw } = input;

  if (!url || !kaipoke_cs_id) return;

  const { data, error } = await supabase
    .from("cs_kaipoke_info")
    .select("id, documents")
    .eq("kaipoke_cs_id", kaipoke_cs_id)
    .maybeSingle();

  const row = data as { id: string; documents: unknown } | null;

  if (error || !row) {
    // 同期は best-effort なので、ログだけ出して終了
    // eslint-disable-next-line no-console
    console.error("[syncCsDocToKaipokeDocuments] fetch error", error);
    return;
  }

  type DocumentItem = {
    url?: string;
    label?: string;
    acquired_at?: string | null;
    [key: string]: unknown;
  };

  const docsJson: DocumentItem[] = Array.isArray(row.documents)
    ? (row.documents as DocumentItem[])
    : [];

  const isoAcquiredAt = normalizeDocDateRawForJson(doc_date_raw);

  let changed = false;
  const updatedDocs = docsJson.map((doc) => {
    if (!doc || doc.url !== url) return doc;

    const next: DocumentItem = { ...doc };

    if (doc_name != null) {
      next.label = doc_name;
    }
    if (isoAcquiredAt) {
      next.acquired_at = isoAcquiredAt;
    }

    changed = true;
    return next;
  });

  if (!changed) return;

  const { error: updateErr } = await supabase
    .from("cs_kaipoke_info")
    .update({ documents: updatedDocs })
    .eq("id", row.id);

  if (updateErr) {
    // eslint-disable-next-line no-console
    console.error(
      "[syncCsDocToKaipokeDocuments] update error",
      updateErr
    );
  }
}

/* ========== 削除 ========== */

export async function deleteCsDocById(id: string): Promise<void> {
  const { error } = await supabase.from("cs_docs").delete().eq("id", id);
  if (error) {
    throw new Error(`cs_docs 削除エラー: ${error.message}`);
  }
}
