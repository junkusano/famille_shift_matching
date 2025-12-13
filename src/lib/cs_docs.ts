// src/lib/cs_docs.ts
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import { supabaseAdmin } from "@/lib/supabase/service";


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

type SyncSmartArgs = {
  url: string | null;
  prevKaipokeCsId: string | null;
  nextKaipokeCsId: string | null;
  source: string;
  doc_name: string | null;
  doc_date_raw: string | null;
};

type DocumentItem = {
  url?: string;
  source?: string;
  doc_name?: string;
  doc_date_raw?: string;
};

function upsertDocItem(list: DocumentItem[], item: DocumentItem): DocumentItem[] {
  const url = item.url ?? "";
  if (!url) return list;

  const idx = list.findIndex((x) => (x?.url ?? "") === url);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...item };
    return next;
  }
  return [{ ...item }, ...list];
}

function removeDocItem(list: DocumentItem[], url: string): DocumentItem[] {
  return list.filter((x) => (x?.url ?? "") !== url);
}

export async function syncCsDocToKaipokeDocumentsSmart(args: SyncSmartArgs) {
  const { url, prevKaipokeCsId, nextKaipokeCsId, source, doc_name, doc_date_raw } = args;
  if (!url) return;

  // 1) documents 内に URL が存在する cs_kaipoke_info をまず探す（URLが真実）
  // ※ documents が JSONB 配列想定
  const { data: hitRows, error: hitErr } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id, kaipoke_cs_id, documents")
    .contains("documents", [{ url }]);

  if (hitErr) throw hitErr;

  const item: DocumentItem = {
    url,
    source,
    doc_name: doc_name ?? undefined,
    doc_date_raw: doc_date_raw ?? undefined,
  };

  const updateRowById = async (id: string, documents: unknown) => {
    const list = Array.isArray(documents) ? (documents as DocumentItem[]) : [];
    const nextDocs = upsertDocItem(list, item);

    const { error } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .update({ documents: nextDocs })
      .eq("id", id);

    if (error) throw error;
  };

  const removeFromKaipokeCsId = async (kaipokeCsId: string) => {
    const { data, error } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .select("id, documents")
      .eq("kaipoke_cs_id", kaipokeCsId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return;

    const list = Array.isArray(data.documents) ? (data.documents as DocumentItem[]) : [];
    const nextDocs = removeDocItem(list, url);

    const { error: uErr } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .update({ documents: nextDocs })
      .eq("id", data.id);

    if (uErr) throw uErr;
  };

  // 2) URLヒットがあるなら、その row を更新
  if (hitRows && hitRows.length > 0) {
    // 複数ヒットしたら全部更新（事故防止）
    for (const r of hitRows) {
      await updateRowById(r.id, (r as any).documents);
    }

    // もし “移動” が発生していて、旧kaipokeCsIdが違うなら旧側から除去
    if (prevKaipokeCsId && nextKaipokeCsId && prevKaipokeCsId !== nextKaipokeCsId) {
      await removeFromKaipokeCsId(prevKaipokeCsId);
    }
    return;
  }

  // 3) URLがどこにも無いなら、nextKaipokeCsId を頼りに upsert
  if (!nextKaipokeCsId) return;

  const { data: target, error: tErr } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id, documents")
    .eq("kaipoke_cs_id", nextKaipokeCsId)
    .maybeSingle();

  if (tErr) throw tErr;
  if (!target) return;

  await updateRowById(target.id, (target as any).documents);

  // 4) move の場合、旧から除去
  if (prevKaipokeCsId && prevKaipokeCsId !== nextKaipokeCsId) {
    await removeFromKaipokeCsId(prevKaipokeCsId);
  }
}

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
  try {
    const { url, kaipoke_cs_id, doc_name, doc_date_raw } = input;
    if (!url) return;

    type DocumentItem = {
      url?: string;
      label?: string;
      acquired_at?: string | null;
      [key: string]: unknown;
    };

    const isoAcquiredAt = normalizeDocDateRawForJson(doc_date_raw);

    const updateDocumentsRow = async (
      row: { id: string; documents: unknown },
      updater: (docs: DocumentItem[]) => DocumentItem[]
    ) => {
      const docsJson: DocumentItem[] = Array.isArray(row.documents)
        ? (row.documents as DocumentItem[])
        : [];

      const updatedDocs = updater(docsJson);

      const { error: updateErr } = await supabase
        .from("cs_kaipoke_info")
        .update({ documents: updatedDocs })
        .eq("id", row.id);

      if (updateErr) {
        console.error("[syncCsDocToKaipokeDocuments] update error", updateErr);
      }
    };

    // --- 1) URL で所有者検索（失敗したらフォールバック） ---
    let foundRow:
      | { id: string; kaipoke_cs_id: string | null; documents: unknown }
      | null = null;

    try {
      const { data: foundByUrl } = await supabase
        .from("cs_kaipoke_info")
        .select("id, kaipoke_cs_id, documents")
        .contains("documents", [{ url }]) // ← ここが落ちる環境があるので try で囲う
        .maybeSingle();

      foundRow = (foundByUrl as typeof foundRow) ?? null;
    } catch (e) {
      console.error("[syncCsDocToKaipokeDocuments] contains() failed:", e);
      foundRow = null;
    }

    // --- 2) URL を含む行が見つかった場合：その行の該当要素を更新 ---
    if (foundRow) {
      await updateDocumentsRow(foundRow, (docs) =>
        docs.map((doc) => {
          if (!doc || doc.url !== url) return doc;
          const next: DocumentItem = { ...doc };
          if (doc_name != null) next.label = doc_name;
          if (isoAcquiredAt) next.acquired_at = isoAcquiredAt;
          return next;
        })
      );

      // kaipoke_cs_id が変更されているなら “引っ越し”
      if (
        kaipoke_cs_id &&
        foundRow.kaipoke_cs_id &&
        foundRow.kaipoke_cs_id !== kaipoke_cs_id
      ) {
        // 旧所有者から削除
        await updateDocumentsRow(foundRow, (docs) =>
          docs.filter((d) => d.url !== url)
        );

        // 新所有者へ追加/更新
        const { data: newOwner } = await supabase
          .from("cs_kaipoke_info")
          .select("id, documents")
          .eq("kaipoke_cs_id", kaipoke_cs_id)
          .maybeSingle();

        if (newOwner) {
          await updateDocumentsRow(
            newOwner as { id: string; documents: unknown },
            (docs) => {
              const idx = docs.findIndex((d) => d.url === url);
              const base: DocumentItem = {
                url,
                label: doc_name ?? undefined,
                acquired_at: isoAcquiredAt ?? null,
              };

              if (idx >= 0) {
                const next = [...docs];
                next[idx] = { ...next[idx], ...base };
                return next;
              }
              return [...docs, base];
            }
          );
        }
      }
      return;
    }

    // --- 3) URL 所有者が見つからない場合：kaipoke_cs_id で決め打ち同期（追加/更新） ---
    if (!kaipoke_cs_id) return;

    const { data: owner } = await supabase
      .from("cs_kaipoke_info")
      .select("id, documents")
      .eq("kaipoke_cs_id", kaipoke_cs_id)
      .maybeSingle();

    if (!owner) return;

    await updateDocumentsRow(
      owner as { id: string; documents: unknown },
      (docs) => {
        const idx = docs.findIndex((d) => d.url === url);
        const base: DocumentItem = {
          url,
          label: doc_name ?? undefined,
          acquired_at: isoAcquiredAt ?? null,
        };

        if (idx >= 0) {
          const next = [...docs];
          next[idx] = { ...next[idx], ...base };
          return next;
        }
        return [...docs, base];
      }
    );
  } catch (e) {
    // ★ この関数は絶対に throw しない（更新処理を止めない）
    console.error("[syncCsDocToKaipokeDocuments] unexpected error:", e);
    return;
  }
}

/* ========== 削除 ========== */

export async function deleteCsDocById(id: string): Promise<void> {
  const { error } = await supabase.from("cs_docs").delete().eq("id", id);
  if (error) {
    throw new Error(`cs_docs 削除エラー: ${error.message}`);
  }
}
