// =============================================================
// src/lib/cm/rpa-jobs/actions.ts
// RPAジョブ管理 Server Actions（管理画面用）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import type {
  CmJobQueue,
  CmJobTypemaster,
  CmJob,
  CmJobWithProgress,
  CmJobItem,
  CmJobProgress,
  CmJobStatus,
} from "@/types/cm/jobs";

const logger = createLogger("lib/cm/rpa-jobs/actions");

// =============================================================
// 定数
// =============================================================

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const VALID_STATUSES: CmJobStatus[] = ["pending", "processing", "completed", "failed", "cancelled"];

// =============================================================
// Result Types
// =============================================================

export type GetJobMasterResult =
  | { ok: true; queues: CmJobQueue[]; jobTypes: CmJobTypemaster[] }
  | { ok: false; error: string };

export type GetJobsParams = {
  queue?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export type GetJobsResult =
  | { ok: true; jobs: CmJobWithProgress[]; total: number }
  | { ok: false; error: string };

export type GetJobDetailResult =
  | { ok: true; job: CmJob; items: CmJobItem[]; progress: CmJobProgress }
  | { ok: false; error: string };

export type CreateJobParams = {
  queue: string;
  job_type: string;
  payload?: Record<string, unknown>;
};

export type CreateJobResult =
  | { ok: true; job: CmJob }
  | { ok: false; error: string; existing_job_id?: number };

export type UpdateJobParams = {
  status?: CmJobStatus;
  progress_message?: string;
  error_message?: string;
};

export type UpdateJobResult =
  | { ok: true; job: CmJob }
  | { ok: false; error: string };

// =============================================================
// getJobMaster - マスタ取得
// =============================================================

export async function getJobMaster(queueCode?: string): Promise<GetJobMasterResult> {
  try {
    logger.info("マスタ取得", { queueCode });

    // キュー一覧取得
    const { data: queues, error: queuesError } = await supabaseAdmin
      .from("cm_job_queues")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (queuesError) {
      logger.error("キュー取得エラー", { message: queuesError.message });
      return { ok: false, error: "キュー一覧の取得に失敗しました" };
    }

    // ジョブタイプ一覧取得
    let jobTypesQuery = supabaseAdmin
      .from("cm_job_types")
      .select("*")
      .eq("is_active", true);

    if (queueCode) {
      jobTypesQuery = jobTypesQuery.eq("queue_code", queueCode);
    }

    const { data: jobTypes, error: jobTypesError } = await jobTypesQuery
      .order("queue_code", { ascending: true })
      .order("sort_order", { ascending: true });

    if (jobTypesError) {
      logger.error("ジョブタイプ取得エラー", { message: jobTypesError.message });
      return { ok: false, error: "ジョブタイプ一覧の取得に失敗しました" };
    }

    return {
      ok: true,
      queues: (queues || []) as CmJobQueue[],
      jobTypes: (jobTypes || []) as CmJobTypemaster[],
    };
  } catch (error) {
    logger.error("マスタ取得例外", error as Error);
    return { ok: false, error: "予期せぬエラーが発生しました" };
  }
}

// =============================================================
// getJobs - ジョブ一覧取得
// =============================================================

export async function getJobs(params: GetJobsParams = {}): Promise<GetJobsResult> {
  try {
    const {
      queue,
      status,
      limit: requestedLimit = DEFAULT_LIMIT,
      offset: requestedOffset = 0,
    } = params;

    const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
    const offset = Math.max(0, requestedOffset);

    logger.info("ジョブ一覧取得", { queue, status, limit, offset });

    // クエリ構築
    let query = supabaseAdmin
      .from("cm_jobs_with_progress")
      .select("*", { count: "exact" });

    if (queue) {
      query = query.eq("queue", queue);
    }
    if (status) {
      query = query.eq("status", status);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // 実行
    const { data: jobs, count, error: queryError } = await query;

    if (queryError) {
      logger.error("ジョブ一覧取得エラー", { message: queryError.message });
      return { ok: false, error: "ジョブ一覧の取得に失敗しました" };
    }

    return {
      ok: true,
      jobs: (jobs || []) as CmJobWithProgress[],
      total: count || 0,
    };
  } catch (error) {
    logger.error("ジョブ一覧取得例外", error as Error);
    return { ok: false, error: "予期せぬエラーが発生しました" };
  }
}

// =============================================================
// getJobDetail - ジョブ詳細取得
// =============================================================

export async function getJobDetail(jobId: number): Promise<GetJobDetailResult> {
  try {
    if (isNaN(jobId) || jobId <= 0) {
      return { ok: false, error: "無効なジョブIDです" };
    }

    logger.info("ジョブ詳細取得", { jobId });

    // ジョブ取得
    const { data: job, error: jobError } = await supabaseAdmin
      .from("cm_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return { ok: false, error: "ジョブが見つかりません" };
    }

    // アイテム取得
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("cm_job_items")
      .select("*")
      .eq("job_id", jobId)
      .order("id", { ascending: true });

    if (itemsError) {
      logger.error("アイテム取得エラー", { message: itemsError.message });
    }

    // 進捗計算
    const itemList = (items || []) as CmJobItem[];
    const total = itemList.length;
    const completed = itemList.filter((i) => i.status === "completed").length;
    const failed = itemList.filter((i) => i.status === "failed").length;
    const pending = itemList.filter((i) => i.status === "pending").length;
    const percent = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    const progress: CmJobProgress = {
      total,
      completed,
      failed,
      pending,
      percent,
    };

    return {
      ok: true,
      job: job as CmJob,
      items: itemList,
      progress,
    };
  } catch (error) {
    logger.error("ジョブ詳細取得例外", error as Error);
    return { ok: false, error: "予期せぬエラーが発生しました" };
  }
}

// =============================================================
// createJob - ジョブ作成
// =============================================================

export async function createJob(params: CreateJobParams): Promise<CreateJobResult> {
  try {
    const { queue, job_type, payload = {} } = params;

    // バリデーション
    if (!queue || typeof queue !== "string") {
      return { ok: false, error: "queue は必須です" };
    }
    if (!job_type || typeof job_type !== "string") {
      return { ok: false, error: "job_type は必須です" };
    }

    logger.info("ジョブ作成開始", { queue, job_type });

    // マスタ存在チェック
    const { data: queueData } = await supabaseAdmin
      .from("cm_job_queues")
      .select("id")
      .eq("code", queue)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!queueData) {
      return { ok: false, error: `無効なキュー: ${queue}` };
    }

    const { data: jobTypeData } = await supabaseAdmin
      .from("cm_job_types")
      .select("id")
      .eq("queue_code", queue)
      .eq("code", job_type)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!jobTypeData) {
      return { ok: false, error: `無効なジョブタイプ: ${job_type}` };
    }

    // アクティブなジョブの存在チェック
    const { data: existingJob } = await supabaseAdmin
      .from("cm_jobs")
      .select("id")
      .eq("queue", queue)
      .eq("job_type", job_type)
      .in("status", ["pending", "processing"])
      .limit(1)
      .single();

    if (existingJob) {
      return {
        ok: false,
        error: "同じタイプのアクティブなジョブが既に存在します",
        existing_job_id: existingJob.id,
      };
    }

    // ジョブ作成
    const { data: newJob, error: insertError } = await supabaseAdmin
      .from("cm_jobs")
      .insert({
        queue,
        job_type,
        payload,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return { ok: false, error: "アクティブなジョブが既に存在します" };
      }
      logger.error("ジョブ作成エラー", { message: insertError.message });
      return { ok: false, error: "ジョブの作成に失敗しました" };
    }

    logger.info("ジョブ作成完了", { jobId: newJob.id });

    return { ok: true, job: newJob as CmJob };
  } catch (error) {
    logger.error("ジョブ作成例外", error as Error);
    return { ok: false, error: "予期せぬエラーが発生しました" };
  }
}

// =============================================================
// updateJob - ジョブ更新
// =============================================================

export async function updateJob(
  jobId: number,
  params: UpdateJobParams
): Promise<UpdateJobResult> {
  try {
    if (isNaN(jobId) || jobId <= 0) {
      return { ok: false, error: "無効なジョブIDです" };
    }

    // バリデーション
    const updates: Record<string, unknown> = {};

    if (params.status !== undefined) {
      if (!VALID_STATUSES.includes(params.status)) {
        return { ok: false, error: `無効なステータス: ${params.status}` };
      }
      updates.status = params.status;
    }

    if (params.progress_message !== undefined) {
      updates.progress_message = params.progress_message;
    }

    if (params.error_message !== undefined) {
      updates.error_message = params.error_message;
    }

    if (Object.keys(updates).length === 0) {
      return { ok: false, error: "更新する項目がありません" };
    }

    logger.info("ジョブ更新開始", { jobId, updates });

    // 更新実行
    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from("cm_jobs")
      .update(updates)
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) {
      logger.error("ジョブ更新エラー", { message: updateError.message });
      return { ok: false, error: "ジョブの更新に失敗しました" };
    }

    if (!updatedJob) {
      return { ok: false, error: "ジョブが見つかりません" };
    }

    logger.info("ジョブ更新完了", { jobId });

    return { ok: true, job: updatedJob as CmJob };
  } catch (error) {
    logger.error("ジョブ更新例外", error as Error);
    return { ok: false, error: "予期せぬエラーが発生しました" };
  }
}