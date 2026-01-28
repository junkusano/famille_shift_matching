// =============================================================
// src/lib/cm/alert-batch/actions.ts
// CMアラートバッチ Server Actions
// =============================================================

"use server";

import { createLogger, generateTraceId } from "@/lib/common/logger";
import { cmAlertBatchOrchestrator } from "@/lib/cm/alert-batch/orchestrator";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { CmBatchStats } from "@/types/cm/alert-batch";

const logger = createLogger("lib/cm/alerts/actions");

// =============================================================
// Types
// =============================================================

export type RunAlertBatchResult = {
  ok: true;
  batchRunId: string;
  stats: CmBatchStats;
} | {
  ok: false;
  error: string;
};

// =============================================================
// Server Action: アラートバッチを手動実行
// =============================================================

export async function runAlertBatch(authUserId: string): Promise<RunAlertBatchResult> {
  const traceId = generateTraceId();
  const log = logger.withTrace(traceId);

  try {
    // 1. usersテーブルからuser_idとsystem_roleを取得
    const { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_id, system_role, service_type")
      .eq("auth_user_id", authUserId)
      .single();

    if (userError || !userData) {
      log.warn("ユーザー情報取得失敗", { authUserId, error: userError?.message });
      return { ok: false, error: "ユーザー情報を取得できません" };
    }

    // 2. service_type チェック（kyotaku or both のみ許可）
    const allowedServiceTypes = ["kyotaku", "both"];
    if (!allowedServiceTypes.includes(userData.service_type)) {
      log.warn("サービスタイプエラー", { authUserId, serviceType: userData.service_type });
      return { ok: false, error: "このサービスへのアクセス権限がありません" };
    }

    // 3. 権限チェック（admin, manager, senior_care_manager のみ許可）
    const allowedRoles = ["admin", "manager", "senior_care_manager"];
    if (!allowedRoles.includes(userData.system_role)) {
      log.warn("権限エラー", { authUserId, role: userData.system_role });
      return { ok: false, error: "バッチ実行権限がありません" };
    }

    log.info("手動バッチ実行開始", { userId: userData.user_id, role: userData.system_role });

    // 4. バッチ実行
    const result = await cmAlertBatchOrchestrator({
      runType: "manual",
      triggeredBy: userData.user_id,
    });

    if (result.ok === true) {
      log.info("手動バッチ実行完了", {
        batchRunId: result.batchRunId,
        stats: result.stats,
      });
      return {
        ok: true,
        batchRunId: result.batchRunId,
        stats: result.stats,
      };
    } else {
      log.warn("手動バッチ実行失敗", {
        batchRunId: result.batchRunId,
        error: result.error,
      });
      return {
        ok: false,
        error: result.error || "バッチ実行に失敗しました",
      };
    }
  } catch (error) {
    log.error("手動バッチ実行エラー", error as Error);
    return { ok: false, error: "Internal Server Error" };
  }
}
