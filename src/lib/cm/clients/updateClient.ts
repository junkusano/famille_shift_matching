// =============================================================
// src/lib/cm/clients/updateClient.ts
// 利用者更新（Server Action）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { revalidatePath } from "next/cache";

const logger = createLogger("lib/cm/clients/updateClient");

// =============================================================
// Types
// =============================================================

export type UpdateClientParams = {
  kaipokeCsId: string;
  biko?: string;
  documents?: Record<string, unknown>[];
};

export type UpdateClientResult = {
  ok: true;
} | {
  ok: false;
  error: string;
};

// =============================================================
// 利用者更新
// =============================================================

export async function updateClient(params: UpdateClientParams): Promise<UpdateClientResult> {
  const { kaipokeCsId, ...fields } = params;

  try {
    logger.info("利用者更新開始", { kaipokeCsId, fields: Object.keys(fields) });

    // 更新可能フィールドのみ抽出
    const allowedFields = ["biko", "documents"];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in fields) {
        updateData[field] = fields[field as keyof typeof fields];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { ok: false, error: "更新可能なフィールドがありません" };
    }

    updateData.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("cm_kaipoke_info")
      .update(updateData)
      .eq("kaipoke_cs_id", kaipokeCsId);

    if (error) {
      logger.error("更新エラー", {
        message: error.message,
        code: error.code,
      });
      return { ok: false, error: error.message };
    }

    logger.info("利用者更新完了", { kaipokeCsId });

    // キャッシュを無効化
    revalidatePath(`/cm-portal/clients/${kaipokeCsId}`);

    return { ok: true };
  } catch (e) {
    logger.error("例外", e);
    return { ok: false, error: "Internal server error" };
  }
}