// =============================================================
// src/types/cm/plaud.ts
// Plaud管理画面用の型定義
// =============================================================

// =============================================================
// ステータス
// =============================================================

/**
 * 文字起こしステータス
 */
export type CmPlaudTranscriptionStatus = 'pending' | 'approved' | 'completed' | 'failed';

/**
 * ステータスラベル定義
 */
export const CM_PLAUD_STATUS_LABELS: Record<CmPlaudTranscriptionStatus, { label: string; bg: string; color: string; description: string }> = {
  pending: {
    label: '待機中',
    bg: '#fef3c7',
    color: '#b45309',
    description: '承認待ち',
  },
  approved: {
    label: '承認済',
    bg: '#dbeafe',
    color: '#1d4ed8',
    description: '取得処理待ち',
  },
  completed: {
    label: '完了',
    bg: '#d1fae5',
    color: '#047857',
    description: '文字起こし完了',
  },
  failed: {
    label: '失敗',
    bg: '#fee2e2',
    color: '#dc2626',
    description: '取得失敗',
  },
};

// =============================================================
// テーブル型定義
// =============================================================

/**
 * cm_plaud_mgmt_transcriptions テーブル
 */
export type CmPlaudTranscription = {
  id: number;
  plaud_id: string;
  title: string;
  status: CmPlaudTranscriptionStatus;
  transcript: string | null;
  kaipoke_cs_id: string | null;
  client_name?: string | null;
  plaud_created_at: string;
  retry_count: number;
  registered_by: string | null;
  created_at: string;
  updated_at: string | null;
};

/**
 * cm_plaud_mgmt_templates テーブル
 */
export type CmPlaudProcessTemplate = {
  id: number;
  name: string;
  description: string | null;
  system_prompt: string | null;
  user_prompt_template: string;
  output_format: string | null;
  is_active: boolean;
  sort_order: number;
  options: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
};

/**
 * cm_plaud_mgmt_history テーブル
 */
export type CmPlaudProcessHistory = {
  id: number;
  transcription_id: number;
  template_id: number;
  kaipoke_cs_id: string | null;
  input_text: string | null;
  output_text: string;
  processed_at: string;
  created_at: string;
  updated_at: string | null;
};

/**
 * 処理履歴（詳細情報付き）
 */
export type CmPlaudProcessHistoryWithDetails = CmPlaudProcessHistory & {
  template_name: string;
  transcription_title: string;
  client_name: string | null;
};

// =============================================================
// 利用者
// =============================================================

/**
 * 利用者（簡易）
 */
export type CmClient = {
  id: string;
  kaipoke_cs_id: string | null;
  name: string;
  kana: string | null;
  birth_date: string | null;
  is_active: boolean;
};

// =============================================================
// フィルター
// =============================================================

/**
 * 文字起こし一覧フィルター
 */
export type CmPlaudTranscriptionFilters = {
  status: CmPlaudTranscriptionStatus | 'all';
  search: string;
  dateFrom: string;
  dateTo: string;
};

/**
 * デフォルトフィルター
 */
export const CM_PLAUD_TRANSCRIPTION_DEFAULT_FILTERS: CmPlaudTranscriptionFilters = {
  status: 'all',
  search: '',
  dateFrom: '',
  dateTo: '',
};

// =============================================================
// ページネーション
// =============================================================

/**
 * ページネーション情報
 */
export type CmPlaudPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

// =============================================================
// API リクエスト/レスポンス
// =============================================================

/**
 * テンプレート作成リクエスト
 */
export type CmPlaudTemplateCreateRequest = {
  name: string;
  description?: string | null;
  system_prompt?: string | null;
  user_prompt_template: string;
  is_active?: boolean;
  sort_order?: number;
};

/**
 * テンプレート更新リクエスト
 */
export type CmPlaudTemplateUpdateRequest = Partial<CmPlaudTemplateCreateRequest>;

/**
 * 処理履歴作成リクエスト
 */
export type CmPlaudHistoryCreateRequest = {
  transcription_id: number;
  template_id: number;
  kaipoke_cs_id?: string | null;
  input_text?: string | null;
  output_text: string;
};

/**
 * 処理履歴更新リクエスト
 */
export type CmPlaudHistoryUpdateRequest = {
  output_text: string;
};

/**
 * AI生成結果アイテム
 */
export type CmPlaudGenerateResultItem = {
  template_id: number;
  success: boolean;
  output_text?: string;
  error?: string;
};

// =============================================================
// UI
// =============================================================

/**
 * タブ種別
 */
export type CmPlaudTabType = 'transcriptions' | 'history' | 'templates';

// =============================================================
// ユーティリティ関数
// =============================================================

/**
 * リトライ回数に応じたメッセージを取得
 */
export function getCmPlaudRetryMessage(retryCount: number): string {
  if (retryCount === 0) return '';
  if (retryCount >= 3) return 'リトライ上限に達しました';
  return `リトライ ${retryCount}/3 回`;
}