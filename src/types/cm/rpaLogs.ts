// =============================================================
// src/types/cm/rpaLogs.ts
// RPAログ画面用の型定義
// =============================================================

import type { CmRpaLogLevel, CmRpaEnv, CmRpaLogRecord } from './rpa';

// =============================================================
// フィルター
// =============================================================

/**
 * ログ検索フィルター
 */
export type CmRpaLogFilters = {
  env: CmRpaEnv | '';
  level: CmRpaLogLevel | '';
  moduleName: string;
  message: string;
  traceId: string;
  from: string;
  to: string;
};

/**
 * フィルターのデフォルト値
 */
export const CM_RPA_LOG_DEFAULT_FILTERS: CmRpaLogFilters = {
  env: '',
  level: '',
  moduleName: '',
  message: '',
  traceId: '',
  from: '',
  to: '',
};

// =============================================================
// ページネーション
// =============================================================

/**
 * ページネーション情報
 */
export type CmRpaLogPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

// =============================================================
// APIレスポンス
// =============================================================

/**
 * ログ一覧取得APIレスポンス
 */
export type CmRpaLogsListResponse = {
  ok: boolean;
  logs?: CmRpaLogRecord[];
  pagination?: CmRpaLogPagination;
  error?: string;
};
