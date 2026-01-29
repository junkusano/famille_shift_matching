// =============================================================
// src/lib/cm/scheduled-jobs/runScheduleAction.ts
// スケジュール実行用のServer Action（Client Componentから呼び出し用）
// =============================================================

'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type {
  CmScheduledJobType,
  CmScheduleRunResult,
  CmScheduledJobTrigger,
  ExecuteSingleScheduleResult,
} from '@/types/cm/scheduledJobs';

const logger = createLogger('lib/cm/scheduled-jobs/runScheduleAction');

/**
 * 指定されたジョブタイプのスケジュールを手動実行
 */
export async function executeSingleSchedule(
  jobTypeId: number
): Promise<ExecuteSingleScheduleResult> {
  try {
    logger.info('手動実行開始', { jobTypeId });

    // ジョブタイプを取得
    const { data: jobType, error: fetchError } = await supabaseAdmin
      .from('cm_job_types')
      .select(`
        id,
        queue_code,
        code,
        name,
        is_scheduled,
        schedule_order,
        schedule_payload,
        schedule_cancel_pending
      `)
      .eq('id', jobTypeId)
      .single();

    if (fetchError || !jobType) {
      logger.error('ジョブタイプ取得失敗', { error: fetchError?.message });
      return { ok: false, error: 'ジョブタイプが見つかりません' };
    }

    const result = await executeScheduleInternal(
      jobType as CmScheduledJobType,
      'manual'
    );

    revalidatePath('/cm-portal/rpa-jobs/schedules');

    return { ok: true, result };
  } catch (error) {
    logger.error('手動実行エラー', error as Error);
    return { ok: false, error: '実行中にエラーが発生しました' };
  }
}

// =============================================================
// 内部実行ロジック
// =============================================================

async function executeScheduleInternal(
  jobType: CmScheduledJobType,
  triggeredBy: CmScheduledJobTrigger
): Promise<CmScheduleRunResult> {
  const startedAt = new Date().toISOString();

  const result: CmScheduleRunResult = {
    job_type_id: jobType.id,
    job_type_name: jobType.name,
    queue_code: jobType.queue_code,
    status: 'success',
    cancelled_job_ids: [],
    created_job_id: null,
    error_message: null,
  };

  logger.info('スケジュール実行開始', {
    job_type_id: jobType.id,
    name: jobType.name,
    triggeredBy,
  });

  try {
    // 1. pending ジョブをキャンセル
    if (jobType.schedule_cancel_pending) {
      result.cancelled_job_ids = await cancelPendingJobs(
        jobType.queue_code,
        jobType.code
      );
    }

    // 2. payload の動的変換
    const payload = resolvePayload(jobType.schedule_payload || {});

    // 3. 新規ジョブ作成
    const { data: newJob, error: createError } = await supabaseAdmin
      .from('cm_jobs')
      .insert({
        queue: jobType.queue_code,
        job_type: jobType.code,
        payload,
        status: 'pending',
      })
      .select('id')
      .single();

    if (createError) {
      throw new Error(`ジョブ作成失敗: ${createError.message}`);
    }

    result.created_job_id = newJob.id;
    result.status = 'success';

    logger.info('スケジュール実行成功', {
      job_type_id: jobType.id,
      createdJobId: result.created_job_id,
    });

  } catch (error) {
    result.status = 'failed';
    result.error_message = error instanceof Error ? error.message : String(error);

    logger.error('スケジュール実行失敗', {
      job_type_id: jobType.id,
      error: result.error_message,
    });
  }

  // 4. 実行履歴を記録
  await recordRun(jobType.id, result, startedAt, triggeredBy);

  // 5. cm_job_types の schedule_last_run 情報を更新
  await updateLastRun(jobType.id, result);

  return result;
}

// =============================================================
// ヘルパー関数
// =============================================================

async function cancelPendingJobs(
  queueCode: string,
  jobTypeCode: string
): Promise<number[]> {
  const { data: pendingJobs, error: fetchError } = await supabaseAdmin
    .from('cm_jobs')
    .select('id')
    .eq('queue', queueCode)
    .eq('job_type', jobTypeCode)
    .eq('status', 'pending');

  if (fetchError || !pendingJobs || pendingJobs.length === 0) {
    return [];
  }

  const jobIds = pendingJobs.map((j) => j.id);

  const { error: updateError } = await supabaseAdmin
    .from('cm_jobs')
    .update({ status: 'cancelled' })
    .in('id', jobIds);

  if (updateError) {
    logger.warn('pendingジョブキャンセル失敗', { error: updateError.message });
    return [];
  }

  return jobIds;
}

function resolvePayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const resolved = { ...payload };
  const now = new Date();

  for (const [key, value] of Object.entries(resolved)) {
    if (value === 'auto') {
      if (key === 'year_month') {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        resolved[key] = `${year}-${month}`;
      } else if (key === 'date') {
        resolved[key] = now.toISOString().split('T')[0];
      } else {
        resolved[key] = now.toISOString();
      }
    }
  }

  return resolved;
}

async function recordRun(
  jobTypeId: number,
  result: CmScheduleRunResult,
  startedAt: string,
  triggeredBy: CmScheduledJobTrigger
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('cm_scheduled_job_runs')
    .insert({
      job_type_id: jobTypeId,
      status: result.status,
      cancelled_job_ids: result.cancelled_job_ids,
      created_job_id: result.created_job_id,
      error_message: result.error_message,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      triggered_by: triggeredBy,
    });

  if (error) {
    logger.error('実行履歴記録失敗', { error: error.message });
  }
}

async function updateLastRun(
  jobTypeId: number,
  result: CmScheduleRunResult
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('cm_job_types')
    .update({
      schedule_last_run_at: new Date().toISOString(),
      schedule_last_run_status: result.status,
      schedule_last_created_job_id: result.created_job_id,
    })
    .eq('id', jobTypeId);

  if (error) {
    logger.error('schedule_last_run更新失敗', { error: error.message });
  }
}
