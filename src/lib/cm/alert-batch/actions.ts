// src/lib/cm/alert-batch/actions.ts
// CMアラートバッチ Server Actions
//
// セキュリティ:
//   requireCmSession(token) による認証を必須実施。
//   さらに system_role による認可チェックを実施。
// =============================================================

"use server";

import { createLogger, generateTraceId } from "@/lib/common/logger";
import { cmAlertBatchOrchestrator } from "@/lib/cm/alert-batch/orchestrator";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { supabaseAdmin } from "@/lib/supabase/service";
import { withAuditLog } from "@/lib/cm/audit/withAuditLog";
import { CM_OP_LOG_ALERT_BATCH_RUN } from "@/constants/cm/operationLogActions";
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

export async function runAlertBatch(token: string): Promise<RunAlertBatchResult> {
  const traceId = generateTraceId();
  const log = logger.withTrace(traceId);

  try {
    // トークン検証（認証・service_type チェック）
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_ALERT_BATCH_RUN,
        resourceType: "alert-batch",
      },
      async () => {
        // users テーブルから system_role を取得（認可チェック）
        const { data: userData, error: userError } = await supabaseAdmin
          .from("users")
          .select("user_id, system_role")
          .eq("user_id", auth.userId)
          .single();

        if (userError || !userData) {
          log.warn("ユーザー情報取得失敗", { userId: auth.userId, error: userError?.message });
          return { ok: false, error: "ユーザー情報を取得できません" };
        }

        // 権限チェック（admin, manager, senior_care_manager のみ許可）
        const allowedRoles = ["admin", "manager", "senior_care_manager"];
        if (!allowedRoles.includes(userData.system_role)) {
          log.warn("権限エラー", { userId: auth.userId, role: userData.system_role });
          return { ok: false, error: "バッチ実行権限がありません" };
        }

        log.info("手動バッチ実行開始", { userId: userData.user_id, role: userData.system_role });

        // バッチ実行
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
      },
    );
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    log.error("手動バッチ実行エラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}