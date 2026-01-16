// =============================================================
// src/types/cm/jobs.ts
// ジョブキュー関連の型定義
// =============================================================

// =============================================================
// マスタ型
// =============================================================

/**
 * キューマスタ
 */
export type CmJobQueue = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * ジョブタイプマスタ
 */
export type CmJobTypemaster = {
  id: number;
  queue_code: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// =============================================================
// ジョブステータス
// =============================================================

/**
 * ジョブステータス
 */
export type CmJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * ジョブアイテムステータス
 */
export type CmJobItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

// =============================================================
// ジョブ
// =============================================================

/**
 * ジョブ（基本）
 */
export type CmJob = {
  /** ジョブID */
  id: number;
  /** キューコード */
  queue: string;
  /** ジョブタイプコード */
  job_type: string;
  /** ステータス */
  status: CmJobStatus;
  /** ジョブ固有のパラメータ */
  payload: Record<string, unknown>;
  /** 進行状況メッセージ（ユーザー向け） */
  progress_message: string | null;
  /** エラーメッセージ */
  error_message: string | null;
  /** 結果データ */
  result: Record<string, unknown> | null;
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
};

/**
 * ジョブ（進捗情報付き）
 * ビュー cm_jobs_with_progress から取得
 */
export type CmJobWithProgress = CmJob & {
  /** アイテム総数 */
  total_items: number;
  /** 完了数 */
  completed_items: number;
  /** 失敗数 */
  failed_items: number;
  /** 未処理数 */
  pending_items: number;
  /** 進捗率（%） */
  progress_percent: number;
};

/**
 * ジョブ進捗情報
 */
export type CmJobProgress = {
  /** アイテム総数 */
  total: number;
  /** 完了数 */
  completed: number;
  /** 失敗数 */
  failed: number;
  /** 未処理数 */
  pending: number;
  /** 進捗率（%） */
  percent: number;
};

// =============================================================
// ジョブアイテム
// =============================================================

/**
 * ジョブアイテム
 */
export type CmJobItem = {
  /** アイテムID */
  id: number;
  /** ジョブID */
  job_id: number;
  /** 処理対象ID */
  target_id: string;
  /** 処理対象名（表示用） */
  target_name: string | null;
  /** ステータス */
  status: CmJobItemStatus;
  /** エラーメッセージ */
  error_message: string | null;
  /** 処理日時 */
  processed_at: string | null;
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
};

// =============================================================
// API リクエスト
// =============================================================

/**
 * ジョブ作成リクエスト
 * POST /api/cm/rpa/jobs
 */
export type CmCreateJobRequest = {
  /** キューコード */
  queue: string;
  /** ジョブタイプコード */
  job_type: string;
  /** ジョブ固有のパラメータ */
  payload?: Record<string, unknown>;
};

/**
 * ジョブ更新リクエスト
 * PUT /api/cm/rpa/jobs/:id
 */
export type CmUpdateJobRequest = {
  /** ステータス */
  status?: CmJobStatus;
  /** 進行状況メッセージ */
  progress_message?: string;
  /** エラーメッセージ */
  error_message?: string;
  /** 結果データ */
  result?: Record<string, unknown>;
};

/**
 * アイテム一括登録リクエスト
 * POST /api/cm/rpa/jobs/:id/items
 */
export type CmCreateJobItemsRequest = {
  items: Array<{
    /** 処理対象ID */
    target_id: string;
    /** 処理対象名（表示用） */
    target_name?: string;
  }>;
};

/**
 * _job パラメータ（既存データ送信APIに付与）
 */
export type CmJobParam = {
  /** ジョブID */
  job_id: number;
  /** 処理対象ID */
  target_id: string;
};

// =============================================================
// API レスポンス
// =============================================================

/**
 * マスタ取得レスポンス
 */
export type CmJobMasterResponse = {
  ok: boolean;
  queues?: CmJobQueue[];
  jobTypes?: CmJobTypemaster[];
  error?: string;
};

/**
 * ジョブ作成レスポンス
 */
export type CmCreateJobResponse = {
  ok: boolean;
  job?: CmJob;
  error?: string;
  /** 既存ジョブID（409 Conflict時） */
  existing_job_id?: number;
};

/**
 * ジョブ一覧レスポンス
 */
export type CmJobListResponse = {
  ok: boolean;
  jobs?: CmJobWithProgress[];
  total?: number;
  error?: string;
};

/**
 * 次のジョブ取得レスポンス
 */
export type CmNextJobResponse = {
  ok: boolean;
  job?: CmJob | null;
  error?: string;
};

/**
 * ジョブ詳細レスポンス
 */
export type CmJobDetailResponse = {
  ok: boolean;
  job?: CmJob;
  items?: CmJobItem[];
  progress?: CmJobProgress;
  error?: string;
};

/**
 * ジョブ更新レスポンス
 */
export type CmUpdateJobResponse = {
  ok: boolean;
  job?: CmJob;
  error?: string;
};

/**
 * アイテム一括登録レスポンス
 */
export type CmCreateJobItemsResponse = {
  ok: boolean;
  count?: number;
  error?: string;
};

// =============================================================
// バリデーション用定数
// =============================================================

/** 有効なジョブステータス */
export const CM_VALID_JOB_STATUSES: readonly CmJobStatus[] = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;

/** 有効なアイテムステータス */
export const CM_VALID_ITEM_STATUSES: readonly CmJobItemStatus[] = [
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped',
] as const;