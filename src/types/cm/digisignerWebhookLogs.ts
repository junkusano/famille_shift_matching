// =============================================================
// src/types/cm/digisignerWebhookLogs.ts
// DigiSigner Webhookログ関連の型定義
// =============================================================

/**
 * DigiSigner Webhookログエントリ
 */
export type CmDigisignerWebhookLogEntry = {
  id: string;
  event_type: string;
  digisigner_document_id: string | null;
  digisigner_signature_request_id: string | null;
  payload: Record<string, unknown>;
  processing_status: "received" | "processed" | "failed" | "rejected";
  processed_at: string | null;
  created_at: string;
};

/**
 * ページネーション情報
 */
export type CmDigisignerWebhookLogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * フィルター
 */
export type CmDigisignerWebhookLogFilters = {
  status: string;
  eventType: string;
  from: string;
  to: string;
};

/**
 * サマリー（集計）
 */
export type CmDigisignerWebhookLogSummary = {
  total: number;
  processed: number;
  received: number;
  failed: number;
  rejected: number;
};

/**
 * フィルターのデフォルト値
 */
export const CM_DIGISIGNER_WEBHOOK_LOG_DEFAULT_FILTERS: CmDigisignerWebhookLogFilters = {
  status: "",
  eventType: "",
  from: "",
  to: "",
};
