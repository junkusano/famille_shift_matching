// =============================================================
// src/types/cm/operationLog.ts
// 操作ログシステムの型定義
// audit.page_views / audit.operation_logs / audit.data_change_logs
// =============================================================

// -------------------------------------------------------------
// DB行の型（SELECT結果のマッピング）
// -------------------------------------------------------------

/** audit.page_views の行 */
export type CmPageView = {
  id: number;
  timestamp: string;
  user_id: string;
  path: string;
  referrer: string | null;
  session_id: string | null;
  ip_address: string | null;
  env: string;
};

/** audit.operation_logs の行 */
export type CmOperationLog = {
  id: string;
  timestamp: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  action: string;
  category: string;
  description: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  trace_id: string | null;
  env: string;
};

/**
 * audit.data_change_logs の行
 *
 * old_data / new_data はオプショナル:
 *   - タイムライン一覧取得時はメモリ削減のため除外して取得する
 *   - 詳細表示時に cmGetDataChangeDetail() で1件ずつ遅延読み込みする
 *   - 変更経緯: Supabase Nano プラン（512MB）でメモリ制約が顕在化したため、
 *     設計書の「全取得」方針を見直し遅延読み込みに変更（2026-03）
 */
export type CmDataChangeLog = {
  id: number;
  timestamp: string;
  schema_name: string;
  table_name: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  record_id: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  changed_fields: string[] | null;
  context_user_id: string | null;
  context_action: string | null;
  context_trace_id: string | null;
};

// -------------------------------------------------------------
// 閲覧画面用の型
// -------------------------------------------------------------

/** タイムライン統合表示の1イベント */
export type CmTimelineEvent = {
  timestamp: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  event_type: "page_view" | "operation";
  action: string;
  category: string | null;
  description: string | null;
  resource_type: string | null;
  resource_id: string | null;
  trace_id: string | null;
  ip_address: string | null;
  db_changes: CmDataChangeLog[];
};

/** 経路フロー表示用のセッション */
export type CmAuditSession = {
  session_key: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  first_timestamp: string;
  last_timestamp: string;
  is_active: boolean;
  events: CmTimelineEvent[];
};

/** 閲覧画面のフィルター条件 */
export type CmAuditLogFilter = {
  start_date: string | null;
  end_date: string | null;
  user_id: string | null;
  category: string | null;
  table_name: string | null;
  operation: string | null;
  record_id: string | null;
  page: number;
  per_page: number;
};

// -------------------------------------------------------------
// recordOperationLog の入力パラメータ
// -------------------------------------------------------------

export type CmRecordOperationLogParams = {
  userId: string;
  userEmail?: string;
  userName?: string;
  action: string;
  category?: string;
  description?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  traceId?: string;
};

// -------------------------------------------------------------
// withAuditLog の入力パラメータ
// -------------------------------------------------------------

export type CmWithAuditLogParams = {
  auth: {
    /** Supabase Auth の user.id（UUID） */
    authUserId: string;
    /** users テーブルの user_id（テキスト） */
    userId: string;
    /** users テーブルの service_type */
    serviceType: string;
  };
  action: string;
  description?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};