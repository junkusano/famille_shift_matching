// =============================================================
// src/lib/cm/audit/recordOperationLog.ts
// audit.operation_logs に1行INSERTする
// withAuditLog から呼ばれる。core.ts から直接呼んではいけない。
// 前提: Supabase Dashboard → API Settings → Exposed schemas に audit を追加済み
// =============================================================

import "server-only";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { cmGetCategoryFromAction } from "@/constants/cm/operationLogActions";
import type { CmRecordOperationLogParams } from "@/types/cm/operationLog";

const logger = createLogger("lib/cm/audit/recordOperationLog");

/**
 * audit.operation_logs に操作ログを1件記録する
 *
 * - category 未指定時は action 名のドット前を自動抽出する
 *   （例: "client.update" → "client"）
 * - エラー時は例外を投げず、ログ記録のみで処理を継続する
 *   （操作ログの記録失敗で業務処理を止めてはいけない）
 */
export async function recordOperationLog(
  params: CmRecordOperationLogParams
): Promise<void> {
  try {
    const category =
      params.category ?? cmGetCategoryFromAction(params.action);

    const { error } = await supabaseAdmin
      .schema("audit")
      .from("operation_logs")
      .insert({
        user_id: params.userId,
        user_email: params.userEmail ?? null,
        user_name: params.userName ?? null,
        action: params.action,
        category,
        description: params.description ?? null,
        resource_type: params.resourceType ?? null,
        resource_id: params.resourceId ?? null,
        metadata: params.metadata ?? {},
        ip_address: params.ipAddress ?? null,
        trace_id: params.traceId ?? null,
      });

    if (error) {
      logger.error("operation_logs INSERT失敗", {
        message: error.message,
        code: error.code,
        action: params.action,
      });
    }
  } catch (e) {
    logger.error(
      "recordOperationLog例外",
      e instanceof Error ? e : undefined
    );
  }
}
