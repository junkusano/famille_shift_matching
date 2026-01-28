// =============================================================
// src/lib/cm/local-fax-phonebook/actions.ts
// ローカルFAX電話帳 Server Actions
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { revalidatePath } from "next/cache";
import { normalizeFaxNumber } from "@/lib/cm/faxNumberUtils";
import { getServiceUrl, SERVICE_NAMES } from "@/lib/cm/serviceCredentials";
import type {
  CmLocalFaxPhonebookEntry,
  CmKaipokeOfficeInfo,
  CmLocalFaxPhonebookSyncResult,
  CmPhonebookGasAddRequest,
  CmPhonebookGasAddResponse,
  CmPhonebookGasUpdateRequest,
  CmPhonebookGasDeleteRequest,
  CmPhonebookGasUpdateDeleteResponse,
  CmPhonebookGasSyncRequest,
  CmPhonebookGasSyncResponse,
} from "@/types/cm/localFaxPhonebook";

const logger = createLogger("lib/cm/local-fax-phonebook/actions");

// =============================================================
// Types
// =============================================================

export type ActionResult<T = void> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

// =============================================================
// 新規作成
// =============================================================

export async function createLocalFaxPhonebookEntry(data: {
  name: string;
  name_kana?: string | null;
  fax_number?: string | null;
  notes?: string | null;
}): Promise<ActionResult<CmLocalFaxPhonebookEntry>> {
  try {
    const { name, name_kana, fax_number, notes } = data;

    // バリデーション
    if (!name || typeof name !== "string" || name.trim() === "") {
      return { ok: false, error: "事業所名は必須です" };
    }

    logger.info("ローカルFAX電話帳新規作成", { name, fax_number });

    // FAX番号の正規化
    const faxNormalized = fax_number ? normalizeFaxNumber(fax_number) : null;

    // GAS Web App経由でXMLに追加（source_idを取得）
    let sourceId: string | null = null;

    const gasWebAppUrl = await getServiceUrl(SERVICE_NAMES.LOCAL_FAX_PHONEBOOK_GAS);

    if (gasWebAppUrl) {
      try {
        const gasRequest: CmPhonebookGasAddRequest = {
          action: "add",
          name: name.trim(),
          name_kana: name_kana?.trim() || undefined,
          fax_number: fax_number?.trim() || undefined,
        };

        const gasResponse = await fetch(gasWebAppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(gasRequest),
        });

        const gasResult: CmPhonebookGasAddResponse = await gasResponse.json();

        if (!gasResult.ok) {
          logger.error("GAS API追加エラー", { error: gasResult.error });
          return { ok: false, error: gasResult.error || "XMLへの追加に失敗しました" };
        }

        sourceId = gasResult.source_id || null;
        logger.info("GAS API追加成功", { sourceId });
      } catch (gasError) {
        logger.error("GAS API通信エラー", gasError);
        return { ok: false, error: "XMLサーバーとの通信に失敗しました" };
      }
    } else {
      logger.warn("GAS URLが未設定のためXML追加をスキップ");
    }

    // DBに登録
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

    logger.info("ローカルFAX電話帳新規作成完了", { id: entry.id, sourceId });

    revalidatePath("/cm-portal/local-fax-phonebook");

    return { ok: true, data: entry as CmLocalFaxPhonebookEntry };
  } catch (error) {
    logger.error("ローカルFAX電話帳作成予期せぬエラー", error);
    return { ok: false, error: "サーバーエラーが発生しました" };
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
  }
): Promise<ActionResult<CmLocalFaxPhonebookEntry>> {
  try {
    const { name, name_kana, fax_number, notes, is_active } = data;

    logger.info("ローカルFAX電話帳更新", { id, name, fax_number });

    // 既存レコードを取得
    const { data: existingEntry, error: fetchError } = await supabaseAdmin
      .from("cm_local_fax_phonebook")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existingEntry) {
      logger.error("ローカルFAX電話帳取得エラー", fetchError);
      return { ok: false, error: "対象のエントリが見つかりません" };
    }

    // 更新データを構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

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

    // GAS Web App経由でXMLを更新（source_idがある場合のみ）
    const gasWebAppUrl = await getServiceUrl(SERVICE_NAMES.LOCAL_FAX_PHONEBOOK_GAS);

    if (gasWebAppUrl && existingEntry.source_id) {
      try {
        const gasRequest: CmPhonebookGasUpdateRequest = {
          action: "update",
          source_id: existingEntry.source_id,
          name: updateData.name as string | undefined,
          name_kana: updateData.name_kana as string | undefined,
          fax_number: updateData.fax_number as string | undefined,
        };

        const gasResponse = await fetch(gasWebAppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(gasRequest),
        });

        const gasResult: CmPhonebookGasUpdateDeleteResponse = await gasResponse.json();

        if (!gasResult.ok) {
          logger.error("GAS API更新エラー", { error: gasResult.error });
          logger.warn("XMLの更新に失敗しましたが、DB更新は続行します");
        } else {
          logger.info("GAS API更新成功", { sourceId: existingEntry.source_id });
        }
      } catch (gasError) {
        logger.error("GAS API通信エラー", gasError);
        logger.warn("GAS APIとの通信に失敗しましたが、DB更新は続行します");
      }
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

    logger.info("ローカルFAX電話帳更新完了", { id });

    revalidatePath("/cm-portal/local-fax-phonebook");

    return { ok: true, data: updatedEntry as CmLocalFaxPhonebookEntry };
  } catch (error) {
    logger.error("ローカルFAX電話帳更新予期せぬエラー", error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 削除
// =============================================================

export async function deleteLocalFaxPhonebookEntry(
  id: number
): Promise<ActionResult<{ deletedId: number }>> {
  try {
    logger.info("ローカルFAX電話帳削除", { id });

    // 既存レコードを取得
    const { data: existingEntry, error: fetchError } = await supabaseAdmin
      .from("cm_local_fax_phonebook")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existingEntry) {
      logger.error("ローカルFAX電話帳取得エラー", fetchError);
      return { ok: false, error: "対象のエントリが見つかりません" };
    }

    // GAS Web App経由でXMLから削除（source_idがある場合のみ）
    const gasWebAppUrl = await getServiceUrl(SERVICE_NAMES.LOCAL_FAX_PHONEBOOK_GAS);

    if (gasWebAppUrl && existingEntry.source_id) {
      try {
        const gasRequest: CmPhonebookGasDeleteRequest = {
          action: "delete",
          source_id: existingEntry.source_id,
        };

        const gasResponse = await fetch(gasWebAppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(gasRequest),
        });

        const gasResult: CmPhonebookGasUpdateDeleteResponse = await gasResponse.json();

        if (!gasResult.ok) {
          logger.error("GAS API削除エラー", { error: gasResult.error });
          return { ok: false, error: gasResult.error || "XMLからの削除に失敗しました" };
        }

        logger.info("GAS API削除成功", { sourceId: existingEntry.source_id });
      } catch (gasError) {
        logger.error("GAS API通信エラー", gasError);
        return { ok: false, error: "XMLサーバーとの通信に失敗しました" };
      }
    }

    // DBから削除
    const { error: deleteError } = await supabaseAdmin
      .from("cm_local_fax_phonebook")
      .delete()
      .eq("id", id);

    if (deleteError) {
      logger.error("ローカルFAX電話帳DB削除エラー", deleteError);
      return { ok: false, error: "削除に失敗しました" };
    }

    logger.info("ローカルFAX電話帳削除完了", { id });

    revalidatePath("/cm-portal/local-fax-phonebook");

    return { ok: true, data: { deletedId: id } };
  } catch (error) {
    logger.error("ローカルFAX電話帳削除予期せぬエラー", error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// カイポケ登録チェック
// =============================================================

export async function checkKaipokeByFaxNumber(
  faxNumber: string
): Promise<ActionResult<CmKaipokeOfficeInfo[]>> {
  try {
    if (!faxNumber) {
      return { ok: true, data: [] };
    }

    const normalizedFax = normalizeFaxNumber(faxNumber);

    if (!normalizedFax || normalizedFax.length < 4) {
      return { ok: true, data: [] };
    }

    logger.info("カイポケ登録チェック", { faxNumber, normalizedFax });

    // cm_kaipoke_other_officeからFAX番号でマッチング
    const { data: kaipokeOffices, error } = await supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("id, office_name, service_type, office_number, fax, fax_proxy")
      .not("fax", "is", null);

    if (error) {
      logger.error("カイポケ事業所取得エラー", error);
      return { ok: false, error: "データ取得に失敗しました" };
    }

    // FAX番号がマッチする事業所を抽出
    const matchedOffices: CmKaipokeOfficeInfo[] = [];

    for (const office of kaipokeOffices || []) {
      const officeFaxNormalized = office.fax ? normalizeFaxNumber(office.fax) : null;
      const officeProxyNormalized = office.fax_proxy ? normalizeFaxNumber(office.fax_proxy) : null;

      if (
        (officeFaxNormalized && officeFaxNormalized === normalizedFax) ||
        (officeProxyNormalized && officeProxyNormalized === normalizedFax)
      ) {
        matchedOffices.push({
          id: office.id,
          office_name: office.office_name,
          service_type: office.service_type,
          office_number: office.office_number,
        });
      }
    }

    logger.info("カイポケ登録チェック完了", { matchedCount: matchedOffices.length });

    return { ok: true, data: matchedOffices };
  } catch (error) {
    logger.error("カイポケチェック予期せぬエラー", error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// XML同期
// =============================================================

export async function syncLocalFaxPhonebookWithXml(): Promise<ActionResult<CmLocalFaxPhonebookSyncResult>> {
  try {
    logger.info("ローカルFAX電話帳同期開始");

    // DBから GAS URL を取得
    const gasWebAppUrl = await getServiceUrl(SERVICE_NAMES.LOCAL_FAX_PHONEBOOK_GAS);

    if (!gasWebAppUrl) {
      logger.error("GAS URLが未設定");
      return {
        ok: false,
        error: "GAS Web App URLが設定されていません。サービス認証情報を登録してください。",
      };
    }

    // GAS Web App経由で同期実行
    const gasRequest: CmPhonebookGasSyncRequest = {
      action: "sync",
    };

    const gasResponse = await fetch(gasWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gasRequest),
    });

    if (!gasResponse.ok) {
      logger.error("GAS API同期HTTPエラー", { status: gasResponse.status });
      return {
        ok: false,
        error: `同期サーバーエラー (HTTP ${gasResponse.status})`,
      };
    }

    const gasResult: CmPhonebookGasSyncResponse = await gasResponse.json();

    if (!gasResult.ok) {
      logger.error("GAS API同期エラー", { error: gasResult.error });
      return {
        ok: false,
        error: gasResult.error || "同期処理に失敗しました",
        data: {
          ok: false,
          summary: gasResult.summary || { xmlOnly: 0, dbOnly: 0, different: 0, duration: 0 },
          log: gasResult.log || [],
          error: gasResult.error,
        },
      };
    }

    logger.info("ローカルFAX電話帳同期完了", {
      xmlOnly: gasResult.summary.xmlOnly,
      dbOnly: gasResult.summary.dbOnly,
      different: gasResult.summary.different,
      duration: gasResult.summary.duration,
    });

    revalidatePath("/cm-portal/local-fax-phonebook");

    return {
      ok: true,
      data: {
        ok: true,
        summary: gasResult.summary,
        log: gasResult.log || [],
      },
    };
  } catch (error) {
    logger.error("ローカルFAX電話帳同期予期せぬエラー", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "サーバーエラーが発生しました",
    };
  }
}
