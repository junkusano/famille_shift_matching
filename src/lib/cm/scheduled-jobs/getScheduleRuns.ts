// =============================================================
// src/lib/cm/scheduled-jobs/getScheduleRuns.ts
// 定期実行履歴取得（履歴モーダル用）
// =============================================================

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type {
  CmScheduledJobRun,
  GetScheduleRunsResult,
} from '@/types/cm/scheduledJobs';

const logger = createLogger('lib/cm/scheduled-jobs/getScheduleRuns');

type GetScheduleRunsParams = {
  jobTypeId: number;
  limit?: number;
};

/**
 * 指定ジョブタイプの実行履歴を取得
 */
export async function getScheduleRuns(
  params: GetScheduleRunsParams
): Promise<GetScheduleRunsResult> {
  const { jobTypeId, limit = 20 } = params;

  try {
    logger.info('実行履歴取得開始', { jobTypeId, limit });

    const { data: runs, error, count } = await supabaseAdmin
      .from('cm_scheduled_job_runs')
      .select('*', { count: 'exact' })
      .eq('job_type_id', jobTypeId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('実行履歴取得エラー', { message: error.message, code: error.code });
      return { ok: false, error: error.message };
    }

    const result: CmScheduledJobRun[] = (runs ?? []).map((run) => ({
      id: run.id,
      job_type_id: run.job_type_id,
      status: run.status as CmScheduledJobRun['status'],
      cancelled_job_ids: run.cancelled_job_ids ?? [],
      created_job_id: run.created_job_id,
      error_message: run.error_message,
      started_at: run.started_at,
      finished_at: run.finished_at,
      triggered_by: run.triggered_by as CmScheduledJobRun['triggered_by'],
      created_at: run.created_at,
    }));

    logger.info('実行履歴取得完了', { jobTypeId, count: result.length, total: count });

    return { ok: true, runs: result, total: count ?? 0 };
  } catch (error) {
    logger.error('予期せぬエラー', error as Error);
    return { ok: false, error: '予期せぬエラーが発生しました' };
  }
}
