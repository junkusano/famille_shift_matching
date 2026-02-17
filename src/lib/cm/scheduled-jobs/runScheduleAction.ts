// src/lib/cm/scheduled-jobs/runScheduleAction.ts
// スケジュール実行用のServer Action（Client Componentから呼び出し用）
//
// セキュリティ:
//   requireCmSession(token) による認証を必須実施。
//   - クライアントから渡された access_token を検証（認証）
//   - 操作ログにユーザーIDを記録（監査証跡）
//
// ※ cron/バッチからの実行は executor.ts 内の同名関数が使用される
// =============================================================

'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { requireCmSession, CmAuthError } from '@/lib/cm/auth/requireCmSession';
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
  jobTypeId: number,
  token: string,
): Promise<ExecuteSingleScheduleResult> {
  try {
    const auth = await requireCmSession(token);

    logger.info('手動実行開始', { jobTypeId, userId: auth.userId });

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
      'manual',
    );

    revalidatePath('/cm-portal/rpa-jobs/schedules');

    return { ok: true, result };
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message };
    }
    logger.error('手動実行エラー', error as Error);
    return { ok: false, error: '実行中にエラーが発生しました' };
  }
}

// =============================================================
// 内部実行ロジック
// =============================================================

async function executeScheduleInternal(
  jobType: CmScheduledJobType,
  triggeredBy: CmScheduledJobTrigger,
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
        jobType.code,
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

    logger.info('スケジュール実行完了', {
      job_type_id: jobType.id,
      created_job_id: newJob.id,
      cancelled: result.cancelled_job_ids.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result.status = 'failed';
    result.error_message = message;
    logger.error('スケジュール実行失敗', { job_type_id: jobType.id, error: message });
  }

  // 4. 実行ログを記録
  await supabaseAdmin.from('cm_schedule_runs').insert({
    job_type_id: jobType.id,
    triggered_by: triggeredBy,
    status: result.status,
    created_job_id: result.created_job_id,
    cancelled_job_ids: result.cancelled_job_ids,
    error_message: result.error_message,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  });

  return result;
}

// =============================================================
// ヘルパー: pending ジョブキャンセル
// =============================================================

async function cancelPendingJobs(queueCode: string, jobTypeCode: string): Promise<number[]> {
  const { data: pendingJobs, error } = await supabaseAdmin
    .from('cm_jobs')
    .select('id')
    .eq('queue', queueCode)
    .eq('job_type', jobTypeCode)
    .eq('status', 'pending');

  if (error || !pendingJobs || pendingJobs.length === 0) {
    return [];
  }

  const ids = pendingJobs.map((j) => j.id);

  await supabaseAdmin
    .from('cm_jobs')
    .update({ status: 'cancelled' })
    .in('id', ids);

  logger.info('pending ジョブをキャンセル', { count: ids.length, ids });

  return ids;
}

// =============================================================
// ヘルパー: payload 動的変換
// =============================================================

function resolvePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === '{{today}}') {
      resolved[key] = new Date().toISOString().split('T')[0];
    } else if (value === '{{now}}') {
      resolved[key] = new Date().toISOString();
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}