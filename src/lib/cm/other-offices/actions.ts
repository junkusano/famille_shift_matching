// src/lib/cm/other-offices/actions.ts
// 他社事業所 Server Actions
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
import type { CmOtherOffice } from "@/types/cm/otherOffices";

const logger = createLogger("lib/cm/other-offices/actions");

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
// FAX代行番号の更新
// =============================================================

export async function updateOtherOfficeFaxProxy(
  id: number,
  faxProxy: string | null,
  token: string,
): Promise<ActionResult<CmOtherOffice>> {
  try {
    const auth = await requireCmSession(token);

    // fax_proxy のバリデーション（nullまたは文字列のみ許可）
    if (faxProxy !== null && typeof faxProxy !== "string") {
      return { ok: false, error: "fax_proxy は文字列またはnullである必要があります" };
    }

    // FAX番号の形式チェック（空文字はnullに変換）
    const normalizedFaxProxy = faxProxy === "" ? null : faxProxy;

    logger.info("他社事業所FAX代行番号更新開始", { id, faxProxy: normalizedFaxProxy, userId: auth.userId });

    // 更新実行
    const { data: updatedOffice, error: updateError } = await supabaseAdmin
      .from("cm_kaipoke_other_office")
      .update({
        fax_proxy: normalizedFaxProxy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === "PGRST116") {
        return { ok: false, error: "指定された事業所が見つかりません" };
      }
      logger.error("他社事業所更新エラー", updateError, { id });
      return { ok: false, error: "更新に失敗しました" };
    }

    logger.info("他社事業所FAX代行番号を更新", {
      id,
      office_name: updatedOffice.office_name,
      fax_proxy: normalizedFaxProxy,
      userId: auth.userId,
    });

    // ページを再検証
    revalidatePath("/cm-portal/other-offices");

    return { ok: true, data: updatedOffice as CmOtherOffice };
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error("他社事業所更新予期せぬエラー", error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 単一事業所の取得（必要に応じて使用）
// =============================================================

export async function getOtherOffice(
  id: number,
  token: string,
): Promise<ActionResult<CmOtherOffice>> {
  try {
    await requireCmSession(token);

    const { data: office, error: queryError } = await supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("*")
      .eq("id", id)
      .single();

    if (queryError) {
      if (queryError.code === "PGRST116") {
        return { ok: false, error: "指定された事業所が見つかりません" };
      }
      logger.error("他社事業所取得エラー", queryError, { id });
      return { ok: false, error: "データ取得に失敗しました" };
    }

    return { ok: true, data: office as CmOtherOffice };
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error("他社事業所取得予期せぬエラー", error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}