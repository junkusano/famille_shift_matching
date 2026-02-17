// src/lib/cm/local-fax-phonebook/actions.ts
// ローカルFAX電話帳 Server Actions
//
// セキュリティ:
//   全アクションで requireCmSession(token) による認証を必須実施。
//   - クライアントから渡された access_token を検証（認証）
//   - 操作ログにユーザーIDを記録（監査証跡）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { revalidatePath } from "next/cache";
import { normalizeFaxNumber } from "@/lib/cm/faxNumberUtils";
import {
  gasAddEntry,
  gasUpdateEntry,
  gasDeleteEntry,
  gasSyncAll,
} from "@/lib/cm/local-fax-phonebook/gasClient";
import { cmFindKaipokeOfficesByFax } from "@/lib/cm/local-fax-phonebook/cmKaipokeMatchByFax";
import type {
  CmLocalFaxPhonebookEntry,
  CmKaipokeOfficeInfo,
  CmLocalFaxPhonebookSyncResult,
} from "@/types/cm/localFaxPhonebook";

const logger = createLogger("lib/cm/local-fax-phonebook/actions");

// =============================================================
// Types
// =============================================================

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// =============================================================
// 共通: revalidate
// =============================================================

const REVALIDATE_PATH = "/cm-portal/local-fax-phonebook";

// =============================================================
// 共通: CmAuthError ハンドリング付き catch
// =============================================================

function handleActionError(
  error: unknown,
  fallbackMessage: string,
): { ok: false; error: string } {
  if (error instanceof CmAuthError) {
    return { ok: false, error: error.message };
  }
  logger.error(fallbackMessage, error);
  return { ok: false, error: "サーバーエラーが発生しました" };
}

// =============================================================
// 新規作成
// =============================================================

export async function createLocalFaxPhonebookEntry(
  data: {
    name: string;
    name_kana?: string | null;
    fax_number?: string | null;
    notes?: string | null;
  },
  token: string,
): Promise<ActionResult<CmLocalFaxPhonebookEntry>> {
  try {
    const auth = await requireCmSession(token);
    const { name, name_kana, fax_number, notes } = data;

    // バリデーション
    if (!name || typeof name !== "string" || name.trim() === "") {
      return { ok: false, error: "事業所名は必須です" };
    }

    logger.info("ローカルFAX電話帳新規作成", { name, fax_number, userId: auth.userId });

    const faxNormalized = fax_number ? normalizeFaxNumber(fax_number) : null;

    // GAS XML追加（source_idを取得）
    let sourceId: string | null = null;
    const gasResult = await gasAddEntry({
      name: name.trim(),
      nameKana: name_kana?.trim() || undefined,
      faxNumber: fax_number?.trim() || undefined,
    });

    if (!gasResult.ok) {
      // URL未設定はスキップ、それ以外はエラー
      if (gasResult.error !== "GAS Web App URLが設定されていません") {
        return { ok: false, error: gasResult.error };
      }
    } else {
      sourceId = gasResult.data.sourceId;
    }

    // DB登録
    const { data: entry, error: insertError } = await supabaseAdmin
      .from("cm_local_fax_phonebook")
      .insert({
        name: name.trim(),
        name_kana: name_kana?.trim() || null,
        fax_number: fax_number?.trim() || null,
        fax_number_normalized: faxNormalized,
        source_id: sourceId,
        notes: notes?.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      logger.error("ローカルFAX電話帳DB登録エラー", insertError);
      return { ok: false, error: "データベースへの登録に失敗しました" };
    }

    logger.info("ローカルFAX電話帳新規作成完了", { id: entry.id, sourceId, userId: auth.userId });

    revalidatePath(REVALIDATE_PATH);
    return { ok: true, data: entry as CmLocalFaxPhonebookEntry };
  } catch (error) {
    return handleActionError(error, "ローカルFAX電話帳作成予期せぬエラー");
  }
}

// =============================================================
// 更新
// =============================================================

export async function updateLocalFaxPhonebookEntry(
  id: number,
  data: {
    name?: string;
    name_kana?: string | null;
    fax_number?: string | null;
    notes?: string | null;
    is_active?: boolean;
  },
  token: string,
): Promise<ActionResult<CmLocalFaxPhonebookEntry>> {
  try {
    const auth = await requireCmSession(token);

    logger.info("ローカルFAX電話帳更新", { id, userId: auth.userId });

    // 既存レコード取得
    const { data: existingEntry, error: fetchError } = await supabaseAdmin
      .from("cm_local_fax_phonebook")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existingEntry) {
      return { ok: false, error: "対象のエントリが見つかりません" };
    }

    // 更新データ構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const { name, name_kana, fax_number, notes, is_active } = data;

    if (name !== undefined) {
      updateData.name = name?.trim() || existingEntry.name;
    }
    if (name_kana !== undefined) {
      updateData.name_kana = name_kana?.trim() || null;
    }
    if (fax_number !== undefined) {
      updateData.fax_number = fax_number?.trim() || null;
      updateData.fax_number_normalized = fax_number ? normalizeFaxNumber(fax_number) : null;
    }
    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }
    if (is_active !== undefined) {
      updateData.is_active = Boolean(is_active);
    }

    // GAS XML更新（source_idがある場合のみ、失敗してもDB更新は続行）
    if (existingEntry.source_id) {
      await gasUpdateEntry({
        sourceId: existingEntry.source_id,
        name: updateData.name as string | undefined,
        nameKana: updateData.name_kana as string | undefined,
        faxNumber: updateData.fax_number as string | undefined,
      });
    }

    // DB更新
    const { data: updatedEntry, error: updateError } = await supabaseAdmin
      .from("cm_local_fax_phonebook")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      logger.error("ローカルFAX電話帳DB更新エラー", updateError);
      return { ok: false, error: "更新に失敗しました" };
    }

    logger.info("ローカルFAX電話帳更新完了", { id, userId: auth.userId });

    revalidatePath(REVALIDATE_PATH);
    return { ok: true, data: updatedEntry as CmLocalFaxPhonebookEntry };
  } catch (error) {
    return handleActionError(error, "ローカルFAX電話帳更新予期せぬエラー");
  }
}

// =============================================================
// 削除
// =============================================================

export async function deleteLocalFaxPhonebookEntry(
  id: number,
  token: string,
): Promise<ActionResult<{ deletedId: number }>> {
  try {
    const auth = await requireCmSession(token);

    logger.info("ローカルFAX電話帳削除", { id, userId: auth.userId });

    // 既存レコード取得
    const { data: existingEntry, error: fetchError } = await supabaseAdmin
      .from("cm_local_fax_phonebook")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existingEntry) {
      return { ok: false, error: "対象のエントリが見つかりません" };
    }

    // GAS XML削除（source_idがある場合のみ、失敗時はDB削除も中止）
    if (existingEntry.source_id) {
      const gasResult = await gasDeleteEntry(existingEntry.source_id);
      if (!gasResult.ok) {
        return { ok: false, error: gasResult.error };
      }
    }

    // DB削除
    const { error: deleteError } = await supabaseAdmin
      .from("cm_local_fax_phonebook")
      .delete()
      .eq("id", id);

    if (deleteError) {
      logger.error("ローカルFAX電話帳DB削除エラー", deleteError);
      return { ok: false, error: "削除に失敗しました" };
    }

    logger.info("ローカルFAX電話帳削除完了", { id, userId: auth.userId });

    revalidatePath(REVALIDATE_PATH);
    return { ok: true, data: { deletedId: id } };
  } catch (error) {
    return handleActionError(error, "ローカルFAX電話帳削除予期せぬエラー");
  }
}

// =============================================================
// カイポケ登録チェック
// =============================================================

export async function checkKaipokeByFaxNumber(
  faxNumber: string,
  token: string,
): Promise<ActionResult<CmKaipokeOfficeInfo[]>> {
  try {
    await requireCmSession(token);

    if (!faxNumber) {
      return { ok: true, data: [] };
    }

    logger.info("カイポケ登録チェック", { faxNumber });

    const matchedOffices = await cmFindKaipokeOfficesByFax(faxNumber);

    logger.info("カイポケ登録チェック完了", { matchedCount: matchedOffices.length });
    return { ok: true, data: matchedOffices };
  } catch (error) {
    return handleActionError(error, "カイポケチェック予期せぬエラー");
  }
}

// =============================================================
// XML同期
// =============================================================

export async function syncLocalFaxPhonebookWithXml(
  token: string,
): Promise<ActionResult<CmLocalFaxPhonebookSyncResult>> {
  try {
    const auth = await requireCmSession(token);

    logger.info("ローカルFAX電話帳同期開始", { userId: auth.userId });

    const gasResult = await gasSyncAll();

    if (!gasResult.ok) {
      return { ok: false, error: gasResult.error };
    }

    const syncResponse = gasResult.data;

    logger.info("ローカルFAX電話帳同期完了", {
      xmlOnly: syncResponse.summary.xmlOnly,
      dbOnly: syncResponse.summary.dbOnly,
      different: syncResponse.summary.different,
      duration: syncResponse.summary.duration,
      userId: auth.userId,
    });

    revalidatePath(REVALIDATE_PATH);

    return {
      ok: true,
      data: {
        ok: true,
        summary: syncResponse.summary,
        log: syncResponse.log || [],
      },
    };
  } catch (error) {
    return handleActionError(error, "ローカルFAX電話帳同期予期せぬエラー");
  }
}