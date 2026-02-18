// =============================================================
// src/lib/cm/contracts/getPlaudRecordingsForContract.ts
// 契約紐付け用 Plaud録音一覧取得（Server Action）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";

const logger = createLogger("lib/cm/contracts/getPlaudRecordingsForContract");

// =============================================================
// Types
// =============================================================

/**
 * 録音選択肢（契約紐付け用）
 */
export type CmPlaudRecordingOption = {
  id: number;
  plaud_uuid: string;
  title: string;
  status: string;
  plaud_created_at: string;
  created_at: string;
};

export type GetPlaudRecordingsForContractResult =
  | { ok: true; data: CmPlaudRecordingOption[] }
  | { ok: false; error: string };

// =============================================================
// 録音一覧取得（利用者のkaipoke_cs_idで絞り込み）
// =============================================================

export async function getPlaudRecordingsForContract(
  kaipokeCsId: string,
  token: string,
): Promise<GetPlaudRecordingsForContractResult> {
  try {
    await requireCmSession(token);

    if (!kaipokeCsId) {
      return { ok: false, error: "kaipoke_cs_id is required" };
    }

    logger.info("契約紐付け用録音一覧取得開始", { kaipokeCsId });

    const { data, error } = await supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("id, plaud_uuid, title, status, plaud_created_at, created_at")
      .eq("kaipoke_cs_id", kaipokeCsId)
      .order("plaud_created_at", { ascending: false });

    if (error) {
      logger.error("録音一覧取得エラー", { message: error.message });
      return { ok: false, error: error.message };
    }

    logger.info("契約紐付け用録音一覧取得完了", {
      kaipokeCsId,
      count: data?.length ?? 0,
    });

    return {
      ok: true,
      data: (data ?? []) as CmPlaudRecordingOption[],
    };
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, error: e.message };
    }
    logger.error("予期せぬエラー", e as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}