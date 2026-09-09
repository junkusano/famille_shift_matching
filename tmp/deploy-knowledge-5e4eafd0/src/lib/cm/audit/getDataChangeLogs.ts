// =============================================================
// src/lib/cm/audit/getDataChangeLogs.ts
// audit.data_change_logs の取得（フィルター・ページネーション対応）
// 閲覧画面の「DB変更履歴」タブおよび getTimeline から使用
// 前提: Supabase Dashboard → API Settings → Exposed schemas に audit を追加済み
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { createLogger } from "@/lib/common/logger";
import type { CmDataChangeLog, CmAuditLogFilter } from "@/types/cm/operationLog";

const logger = createLogger("lib/cm/audit/getDataChangeLogs");

// =============================================================
// 型定義
// =============================================================

type GetDataChangeLogsResult = {
  ok: boolean;
  data: CmDataChangeLog[];
  total: number;
  error?: string;
};

// =============================================================
// メイン関数
// =============================================================

/**
 * audit.data_change_logs をフィルター・ページネーション付きで取得する
 *
 * - 閲覧画面のDB変更履歴タブから直接呼ばれる
 * - テーブル名・操作種別・レコードIDでのフィルター可能
 * - 読み取り専用のためwithAuditLogは不要
 */
export async function cmGetDataChangeLogs(
  filter: CmAuditLogFilter,
  token: string
): Promise<GetDataChangeLogsResult> {
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
      .from("data_change_logs")
      .select("*", { count: "exact" });

    // フィルター適用
    if (filter.start_date) {
      query = query.gte("timestamp", filter.start_date);
    }
    if (filter.end_date) {
      query = query.lte("timestamp", filter.end_date);
    }
    if (filter.user_id) {
      query = query.eq("context_user_id", filter.user_id);
    }
    if (filter.table_name) {
      query = query.eq("table_name", filter.table_name);
    }
    if (filter.operation) {
      query = query.eq("operation", filter.operation);
    }
    if (filter.record_id) {
      query = query.eq("record_id", filter.record_id);
    }

    // ページネーション
    const offset = (filter.page - 1) * filter.per_page;
    query = query
      .order("timestamp", { ascending: false })
      .range(offset, offset + filter.per_page - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.error("data_change_logs取得エラー", undefined, { error: error.message });
      return { ok: false, data: [], total: 0, error: "データ取得に失敗しました" };
    }

    return {
      ok: true,
      data: (data as CmDataChangeLog[]) ?? [],
      total: count ?? 0,
    };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, data: [], total: 0, error: "サーバーエラーが発生しました" };
  }
}
