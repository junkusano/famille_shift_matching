// =============================================================
// src/lib/cm/audit/getAuditLogs.ts
// システムログ取得（Server Component用）
// =============================================================

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import type { CmLogEntry, CmAuditLogPagination } from "@/types/cm/auditLogs";

const logger = createLogger("lib/cm/audit/getAuditLogs");

// 1ページあたりの件数
const DEFAULT_LIMIT = 50;

// =============================================================
// Types
// =============================================================

export type GetAuditLogsParams = {
  page?: number;
  env?: string;
  level?: string;
  moduleName?: string;
  message?: string;
  traceId?: string;
  from?: string;
  to?: string;
};

export type GetAuditLogsResult = {
  ok: true;
  logs: CmLogEntry[];
  pagination: CmAuditLogPagination;
} | {
  ok: false;
  error: string;
};

// =============================================================
// ログ検索
// =============================================================

export async function getAuditLogs(
  params: GetAuditLogsParams = {}
): Promise<GetAuditLogsResult> {
  const {
    page = 1,
    env = "",
    level = "",
    moduleName = "",
    message = "",
    traceId = "",
    from = "",
    to = "",
  } = params;

  const limit = DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  try {
    logger.info("ログ検索開始", { env, level, from, to, moduleName, message, traceId, page });

    // クエリ構築（audit スキーマを直接参照）
    let query = supabaseAdmin
      .schema("audit")
      .from("system_logs")
      .select("*", { count: "exact" });

    if (env && ["production", "preview", "development"].includes(env)) {
      query = query.eq("env", env);
    }

    if (level && ["warn", "error"].includes(level)) {
      query = query.eq("level", level);
    }

    if (from) {
      query = query.gte("timestamp", from);
    }

    if (to) {
      query = query.lte("timestamp", to);
    }

    if (moduleName) {
      query = query.ilike("module", `%${moduleName}%`);
    }

    if (message) {
      query = query.ilike("message", `%${message}%`);
    }

    if (traceId) {
      query = query.eq("trace_id", traceId);
    }

    query = query
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    // 実行
    const { data, error, count } = await query;

    if (error) {
      logger.error("クエリエラー", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return { ok: false, error: error.message || "クエリエラー" };
    }

    logger.info("ログ検索完了", { count, page });

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      ok: true,
      logs: (data || []) as CmLogEntry[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      },
    };
  } catch (e) {
    logger.error("例外", e);
    return { ok: false, error: "Internal server error" };
  }
}
