// =============================================================
// src/lib/cm/audit/withAuditLog.ts
// 操作ログの中核ヘルパー
// actions.ts の return をラップするだけで以下を自動処理する:
//   1. set_audit_context — DBトリガーにコンテキスト渡し
//   2. fn() — 業務ロジック実行
//   3. recordOperationLog — 成功時のみ操作ログ記録
// core.ts から呼んではいけない（認証は呼び出し元の責務）
// =============================================================

import "server-only";

import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { recordOperationLog } from "@/lib/cm/audit/recordOperationLog";
import type { CmWithAuditLogParams } from "@/types/cm/operationLog";

const logger = createLogger("lib/cm/audit/withAuditLog");

/**
 * Server Actions の書き込み操作をラップし、操作ログを自動記録する
 *
 * @example
 * ```typescript
 * export async function updateClient(data: UpdateData, token: string) {
 *   const auth = await requireCmSession(token);
 *   return withAuditLog(
 *     { auth, action: CM_OP_LOG_CLIENT_UPDATE, resourceType: "client", resourceId: data.id },
 *     async () => {
 *       // 既存の業務ロジック
 *       return { ok: true };
 *     }
 *   );
 * }
 * ```
 */
export async function withAuditLog<T>(
  params: CmWithAuditLogParams,
  fn: () => Promise<T>
): Promise<T> {
  const traceId = randomUUID();

  // 1. DBトリガーにコンテキストを渡す
  //    set_audit_context は public スキーマの RPC なので .rpc() で直接呼べる
  try {
    await supabaseAdmin.rpc("set_audit_context", {
      p_user_id: params.auth.authUserId,
      p_action: params.action,
      p_trace_id: traceId,
    });
  } catch (e) {
    // set_audit_context の失敗で業務処理を止めない
    logger.error(
      "set_audit_context失敗",
      e instanceof Error ? e : undefined
    );
  }

  // 2. 業務ロジック実行
  const result = await fn();

  // 3. 成功時のみ操作ログを記録する
  //    { ok: false } パターンの場合は記録しない
  const isFailure =
    result != null &&
    typeof result === "object" &&
    "ok" in result &&
    (result as { ok: boolean }).ok === false;

  if (!isFailure) {
    await recordOperationLog({
      userId: params.auth.authUserId,
      action: params.action,
      description: params.description,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata,
      traceId,
    });
  }

  return result;
}