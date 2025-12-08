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
  doc_date_raw: string | null; // date を文字列として扱う
  created_at: string | null;
};

export type CsKaipokeInfo = {
  kaipoke_cs_id: string;
  name: string;
};

export type CsDocsInitialData = {
  docs: CsDocRow[];
  kaipokeList: CsKaipokeInfo[];
};

/* ========== 一覧取得（cs_docs + cs_kaipoke_info） ========== */

export async function getCsDocsInitialData(): Promise<CsDocsInitialData> {
  // cs_docs 一覧
  const { data: docs, error: docsErr } = await supabase
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
      `
    )
    .order("created_at", { ascending: false });

  if (docsErr) {
    throw new Error(`cs_docs 取得エラー: ${docsErr.message}`);
  }

  // 利用者一覧（kaipoke_cs_id, name だけ）
  const { data: kaipokeList, error: kaipokeErr } = await supabase
    .from("cs_kaipoke_info")
    .select("kaipoke_cs_id, name")
    .order("name", { ascending: true });

  if (kaipokeErr) {
    throw new Error(`cs_kaipoke_info 取得エラー: ${kaipokeErr.message}`);
  }

  return {
    docs: (docs ?? []) as CsDocRow[],
    kaipokeList: (kaipokeList ?? []) as CsKaipokeInfo[],
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
  const {
    id,
    url,
    kaipoke_cs_id,
    source,
    doc_name,
    ocr_text,
    summary,
    doc_date_raw,
  } = input;

  // ★ すべてのフィールドを明示的に update 対象にする
  const { error } = await supabase
    .from("cs_docs")
    .update({
      url,
      kaipoke_cs_id,
      source,
      doc_name,
      ocr_text,
      summary,
      doc_date_raw,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`cs_docs 更新エラー: ${error.message}`);
  }
}

/* ========== 削除 ========== */

export async function deleteCsDocById(id: string): Promise<void> {
  const { error } = await supabase.from("cs_docs").delete().eq("id", id);
  if (error) {
    throw new Error(`cs_docs 削除エラー: ${error.message}`);
  }
}
