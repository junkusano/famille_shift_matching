// =============================================================
// src/lib/cm/rpa/cmRpaJobItemHelper.ts
// RPA ジョブアイテム ステータス更新ヘルパー
//
// kaipoke/other-office と kaipoke/service-usage で
// 重複していた markJobItemCompleted / markJobItemFailed を統合
// =============================================================

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";

const logger = createLogger("lib/cm/rpa/cmRpaJobItemHelper");

// =============================================================
// 型定義
// =============================================================

/**
 * ジョブアイテムを特定するための参照情報
 */
export type CmJobItemRef = {
  job_id: number;
  target_id: string;
};

// =============================================================
// ヘルパー関数
// =============================================================

/**
 * ジョブアイテムを完了にする
 */
export async function cmMarkJobItemCompleted(ref: CmJobItemRef): Promise<void> {
  try {
    await supabaseAdmin
      .from("cm_job_items")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
      })
      .eq("job_id", ref.job_id)
      .eq("target_id", ref.target_id);
  } catch (error) {
    logger.error("ジョブアイテム完了更新エラー", error as Error, {
      job_id: ref.job_id,
      target_id: ref.target_id,
    });
  }
}

/**
 * ジョブアイテムを失敗にする
 */
export async function cmMarkJobItemFailed(
  ref: CmJobItemRef,
  errorMessage: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from("cm_job_items")
      .update({
        status: "failed",
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq("job_id", ref.job_id)
      .eq("target_id", ref.target_id);
  } catch (error) {
    logger.error("ジョブアイテム失敗更新エラー", error as Error, {
      job_id: ref.job_id,
      target_id: ref.target_id,
    });
  }
}
