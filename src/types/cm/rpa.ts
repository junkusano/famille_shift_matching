// =============================================================
// src/types/cm/rpa.ts
// RPA関連の型定義
// =============================================================

/**
 * ログレベル
 */
export type CmRpaLogLevel = 'info' | 'warn' | 'error';

/**
 * 実行環境
 */
export type CmRpaEnv = 'production' | 'preview' | 'development';

/**
 * サービス名
 */
export type CmRpaServiceName = 'kaipoke' | 'plaud' | 'colab';

// =============================================================
// ログ API
// =============================================================

/**
 * ログ保存リクエストボディ
 */
export type CmRpaLogRequest = {
  timestamp: string;
  level: CmRpaLogLevel;
  env: CmRpaEnv;
  module: string;
  action: string | null;
  message: string;
  trace_id: string | null;
  context: Record<string, unknown> | null;
  error_name: string | null;
  error_message: string | null;
  error_stack: string | null;
};

/**
 * ログ保存APIレスポンス
 */
export type CmRpaLogsApiResponse = {
  ok: boolean;
  error?: string;
};

// =============================================================
// 認証情報 API
// =============================================================

/**
 * Kaipoke認証情報
 */
export type CmRpaKaipokeCredentials = {
  url: string;
  corporationId: string;
  userId: string;
  password: string;
};

/**
 * Plaud認証情報
 */
export type CmRpaPlaudCredentials = {
  url: string;
  username: string;
  password: string;
};

/**
 * Colab認証情報
 */
export type CmRpaColabCredentials = {
  url: string;
};

/**
 * 認証情報（サービス共通）
 */
export type CmRpaCredentialItem = {
  id: number;
  service_name: CmRpaServiceName;
  label: string | null;
  credentials: CmRpaKaipokeCredentials | CmRpaPlaudCredentials | CmRpaColabCredentials;
  is_active: boolean;
};

/**
 * 認証情報取得APIレスポンス
 */
export type CmRpaCredentialsApiResponse = {
  ok: boolean;
  credentials?: CmRpaCredentialItem[];
  error?: string;
};

// =============================================================
// 内部用（DB操作）
// =============================================================

/**
 * APIキーレコード（DB）
 */
export type CmRpaApiKeyRecord = {
  id: number;
  key_name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * ログレコード（DB）
 */
export type CmRpaLogRecord = {
  id: string;
  timestamp: string;
  level: CmRpaLogLevel;
  env: CmRpaEnv;
  module: string;
  action: string | null;
  message: string;
  trace_id: string | null;
  context: Record<string, unknown> | null;
  error_name: string | null;
  error_message: string | null;
  error_stack: string | null;
  created_at: string;
};

/**
 * 認証情報レコード（DB）
 */
export type CmRpaCredentialRecord = {
  id: number;
  service_name: string;
  label: string | null;
  credentials: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};