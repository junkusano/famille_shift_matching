// =============================================================
// src/lib/cm/audit/getOperationLogs.ts
// audit.operation_logs の取得（フィルター・ページネーション対応）
// 閲覧画面の「操作ログ」タブおよび getTimeline から使用
// 前提: Supabase Dashboard → API Settings → Exposed schemas に audit を追加済み
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { createLogger } from "@/lib/common/logger";
import type { CmOperationLog, CmAuditLogFilter } from "@/types/cm/operationLog";

const logger = createLogger("lib/cm/audit/getOperationLogs");

// =============================================================
// 型定義
// =============================================================

type GetOperationLogsResult = {
  ok: boolean;
  data: CmOperationLog[];
  total: number;
  error?: string;
};

// =============================================================
// メイン関数
// =============================================================

/**
 * audit.operation_logs をフィルター・ページネーション付きで取得する
 *
 * - 閲覧画面の操作ログタブから直接呼ばれる
 * - 読み取り専用のためwithAuditLogは不要
 */
export async function cmGetOperationLogs(
  filter: CmAuditLogFilter,
  token: string
): Promise<GetOperationLogsResult> {
  try {
    await requireCmSession(token);
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, data: [], total: 0, error: e.message };
    }
    throw e;
  }

  try {
    let query = supabaseAdmin
      .schema("audit")
      .from("operation_logs")
      .select("*", { count: "exact" });

    // フィルター適用
    if (filter.start_date) {
      query = query.gte("timestamp", filter.start_date);
    }
    if (filter.end_date) {
      query = query.lte("timestamp", filter.end_date);
    }
    if (filter.user_id) {
      query = query.eq("user_id", filter.user_id);
    }
    if (filter.category) {
      query = query.eq("category", filter.category);
    }

    // ページネーション
    const offset = (filter.page - 1) * filter.per_page;
    query = query
      .order("timestamp", { ascending: false })
      .range(offset, offset + filter.per_page - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.error("operation_logs取得エラー", undefined, { error: error.message });
      return { ok: false, data: [], total: 0, error: "データ取得に失敗しました" };
    }

    return {
      ok: true,
      data: (data as CmOperationLog[]) ?? [],
      total: count ?? 0,
    };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, data: [], total: 0, error: "サーバーエラーが発生しました" };
  }
}
