// =============================================================
// src/types/cm/auditLogs.ts
// システムログ関連の型定義
// =============================================================

/**
 * ログエントリ
 */
export type CmLogEntry = {
  id: string;
  timestamp: string;
  level: 'warn' | 'error';
  module: string;
  action: string | null;
  message: string;
  context: Record<string, unknown> | null;
  trace_id: string | null;
  env: string;
  error_name: string | null;
  error_message: string | null;
  error_stack: string | null;
};

/**
 * ページネーション情報
 */
export type CmAuditLogPagination = {
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
export type CmAuditLogFilters = {
  env: string;
  level: string;
  moduleName: string;
  message: string;
  traceId: string;
  from: string;
  to: string;
};

/**
 * APIレスポンス
 */
export type CmAuditLogsApiResponse = {
  ok: boolean;
  logs?: CmLogEntry[];
  pagination?: CmAuditLogPagination;
  error?: string;
};

/**
 * フィルターのデフォルト値
 */
export const CM_AUDIT_LOG_DEFAULT_FILTERS: CmAuditLogFilters = {
  env: '',
  level: '',
  moduleName: '',
  message: '',
  traceId: '',
  from: '',
  to: '',
};