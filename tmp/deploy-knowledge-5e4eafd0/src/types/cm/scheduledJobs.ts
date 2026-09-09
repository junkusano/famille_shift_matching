// =============================================================
// src/types/cm/scheduledJobs.ts
// 定期スケジュールジョブ関連の型定義
// =============================================================

// =============================================================
// 実行結果ステータス
// =============================================================

/**
 * 実行結果ステータス
 */
export type CmScheduledJobRunStatus = 'success' | 'failed';

/**
 * 実行トリガー
 */
export type CmScheduledJobTrigger = 'cron' | 'manual';

// =============================================================
// スケジュール設定付きジョブタイプ
// =============================================================

/**
 * 定期実行設定されたジョブタイプ（一覧表示用）
 */
export type CmScheduledJobType = {
  id: number;
  queue_code: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  // スケジュール設定
  is_scheduled: boolean;
  schedule_order: number | null;
  schedule_payload: Record<string, unknown>;
  schedule_cancel_pending: boolean;
  schedule_last_run_at: string | null;
  schedule_last_run_status: CmScheduledJobRunStatus | null;
  schedule_last_created_job_id: number | null;
  // キュー情報（JOIN）
  queue_name: string;
};

/**
 * 未設定ジョブタイプ（追加モーダル用）
 */
export type CmAvailableJobType = {
  id: number;
  queue_code: string;
  queue_name: string;
  code: string;
  name: string;
};

// =============================================================
// 実行履歴
// =============================================================

/**
 * 実行履歴レコード
 */
export type CmScheduledJobRun = {
  id: string;
  job_type_id: number;
  status: CmScheduledJobRunStatus;
  cancelled_job_ids: number[];
  created_job_id: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  triggered_by: CmScheduledJobTrigger;
  created_at: string;
};

// =============================================================
// lib関数の戻り値型
// =============================================================

/**
 * 定期実行ジョブタイプ一覧取得結果
 */
export type GetScheduledJobTypesResult =
  | {
      ok: true;
      jobTypes: CmScheduledJobType[];
    }
  | {
      ok: false;
      error: string;
    };

/**
 * 未設定ジョブタイプ一覧取得結果
 */
export type GetAvailableJobTypesResult =
  | {
      ok: true;
      jobTypes: CmAvailableJobType[];
    }
  | {
      ok: false;
      error: string;
    };

/**
 * 実行履歴一覧取得結果
 */
export type GetScheduleRunsResult =
  | {
      ok: true;
      runs: CmScheduledJobRun[];
      total: number;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * スケジュール更新結果
 */
export type UpdateScheduleResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * スケジュール実行結果（単一）
 */
export type CmScheduleRunResult = {
  job_type_id: number;
  job_type_name: string;
  queue_code: string;
  status: CmScheduledJobRunStatus;
  cancelled_job_ids: number[];
  created_job_id: number | null;
  error_message: string | null;
};

/**
 * 一括実行結果
 */
export type ExecuteAllSchedulesResult =
  | {
      ok: true;
      results: CmScheduleRunResult[];
    }
  | {
      ok: false;
      error: string;
    };

/**
 * 単一実行結果
 */
export type ExecuteSingleScheduleResult =
  | {
      ok: true;
      result: CmScheduleRunResult;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================
// Server Actions用のリクエスト型
// =============================================================

/**
 * スケジュール追加パラメータ
 */
export type AddScheduleParams = {
  jobTypeId: number;
  schedulePayload?: Record<string, unknown>;
  scheduleCancelPending?: boolean;
  isScheduled?: boolean;
};

/**
 * スケジュール設定更新パラメータ
 */
export type UpdateScheduleParams = {
  jobTypeId: number;
  schedulePayload?: Record<string, unknown>;
  scheduleCancelPending?: boolean;
  isScheduled?: boolean;
};

/**
 * 並び順更新パラメータ
 */
export type ReorderSchedulesParams = {
  /** job_type_id の配列（新しい順序） */
  order: number[];
};
