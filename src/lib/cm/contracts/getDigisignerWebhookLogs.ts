// =============================================================
// src/lib/cm/contracts/getDigisignerWebhookLogs.ts
// DigiSigner Webhookログ取得（Server Component用）
// =============================================================

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import type {
  CmDigisignerWebhookLogEntry,
  CmDigisignerWebhookLogPagination,
  CmDigisignerWebhookLogSummary,
} from "@/types/cm/digisignerWebhookLogs";

const logger = createLogger("lib/cm/contracts/getDigisignerWebhookLogs");

// 1ページあたりの件数
const DEFAULT_LIMIT = 50;

// =============================================================
// Types
// =============================================================

export type GetDigisignerWebhookLogsParams = {
  page?: number;
  status?: string;
  eventType?: string;
  from?: string;
  to?: string;
};

export type GetDigisignerWebhookLogsResult =
  | {
      ok: true;
      logs: CmDigisignerWebhookLogEntry[];
      pagination: CmDigisignerWebhookLogPagination;
      summary: CmDigisignerWebhookLogSummary;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================
// サマリー取得
// =============================================================

async function getDigisignerWebhookLogSummary(): Promise<CmDigisignerWebhookLogSummary> {
  const defaultSummary: CmDigisignerWebhookLogSummary = {
    total: 0,
    processed: 0,
    received: 0,
    failed: 0,
    rejected: 0,
  };

  try {
    // 全件数
    const { count: total } = await supabaseAdmin
      .from("cm_contract_webhook_logs")
      .select("*", { count: "exact", head: true });

    // processed
    const { count: processed } = await supabaseAdmin
      .from("cm_contract_webhook_logs")
      .select("*", { count: "exact", head: true })
      .eq("processing_status", "processed");

    // received
    const { count: received } = await supabaseAdmin
      .from("cm_contract_webhook_logs")
      .select("*", { count: "exact", head: true })
      .eq("processing_status", "received");

    // failed
    const { count: failed } = await supabaseAdmin
      .from("cm_contract_webhook_logs")
      .select("*", { count: "exact", head: true })
      .eq("processing_status", "failed");

    // rejected
    const { count: rejected } = await supabaseAdmin
      .from("cm_contract_webhook_logs")
      .select("*", { count: "exact", head: true })
      .eq("processing_status", "rejected");

    return {
      total: total || 0,
      processed: processed || 0,
      received: received || 0,
      failed: failed || 0,
      rejected: rejected || 0,
    };
  } catch (e) {
    logger.warn("サマリー取得エラー", { error: e });
    return defaultSummary;
  }
}

// =============================================================
// ログ検索
// =============================================================

export async function getDigisignerWebhookLogs(
  params: GetDigisignerWebhookLogsParams = {}
): Promise<GetDigisignerWebhookLogsResult> {
  const {
    page = 1,
    status = "",
    eventType = "",
    from = "",
    to = "",
  } = params;

  const limit = DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  try {
    logger.info("DigiSigner Webhookログ検索開始", { status, eventType, from, to, page });

    // クエリ構築
    let query = supabaseAdmin
      .from("cm_contract_webhook_logs")
      .select("*", { count: "exact" });

    if (
      status &&
      ["received", "processed", "failed", "rejected"].includes(status)
    ) {
      query = query.eq("processing_status", status);
    }

    if (
      eventType &&
      ["SIGNATURE_REQUEST_COMPLETED", "DOCUMENT_SIGNED"].includes(eventType)
    ) {
      query = query.eq("event_type", eventType);
    }

    if (from) {
      query = query.gte("created_at", from);
    }

    if (to) {
      query = query.lte("created_at", to);
    }

    query = query
      .order("created_at", { ascending: false })
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

    logger.info("DigiSigner Webhookログ検索完了", { count, page });

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    // サマリーも取得
    const summary = await getDigisignerWebhookLogSummary();

    return {
      ok: true,
      logs: (data || []) as CmDigisignerWebhookLogEntry[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      },
      summary,
    };
  } catch (e) {
    logger.error("例外", e);
    return { ok: false, error: "Internal server error" };
  }
}
