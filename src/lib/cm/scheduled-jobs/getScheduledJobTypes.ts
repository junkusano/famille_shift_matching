// =============================================================
// src/lib/cm/scheduled-jobs/getScheduledJobTypes.ts
// 定期実行設定されたジョブタイプ一覧取得（Server Component用）
// =============================================================

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type {
  CmScheduledJobType,
  GetScheduledJobTypesResult,
} from '@/types/cm/scheduledJobs';

const logger = createLogger('lib/cm/scheduled-jobs/getScheduledJobTypes');

/**
 * 定期実行設定されたジョブタイプ一覧を取得
 * schedule_order 順でソート
 */
export async function getScheduledJobTypes(): Promise<GetScheduledJobTypesResult> {
  try {
    logger.info('定期実行ジョブタイプ一覧取得開始');

    // ジョブタイプ + キュー情報を取得
    const { data: jobTypes, error } = await supabaseAdmin
      .from('cm_job_types')
      .select(`
        id,
        queue_code,
        code,
        name,
        description,
        is_active,
        is_scheduled,
        schedule_order,
        schedule_payload,
        schedule_cancel_pending,
        schedule_last_run_at,
        schedule_last_run_status,
        schedule_last_created_job_id,
        cm_job_queues (
          name
        )
      `)
      .eq('is_scheduled', true)
      .order('schedule_order', { ascending: true, nullsFirst: false });

    if (error) {
      logger.error('ジョブタイプ取得エラー', { message: error.message, code: error.code });
      return { ok: false, error: error.message };
    }

    // レスポンス整形
    const result: CmScheduledJobType[] = (jobTypes ?? []).map((jt) => {
      const queue = jt.cm_job_queues as { name: string }[] | { name: string } | null;
      const queueName = Array.isArray(queue) ? queue[0]?.name : queue?.name;
      return {
        id: jt.id,
        queue_code: jt.queue_code,
        code: jt.code,
        name: jt.name,
        description: jt.description,
        is_active: jt.is_active,
        is_scheduled: jt.is_scheduled ?? false,
        schedule_order: jt.schedule_order,
        schedule_payload: (jt.schedule_payload as Record<string, unknown>) ?? {},
        schedule_cancel_pending: jt.schedule_cancel_pending ?? true,
        schedule_last_run_at: jt.schedule_last_run_at,
        schedule_last_run_status: jt.schedule_last_run_status as CmScheduledJobType['schedule_last_run_status'],
        schedule_last_created_job_id: jt.schedule_last_created_job_id,
        queue_name: queueName ?? jt.queue_code,
      };
    });

    logger.info('定期実行ジョブタイプ一覧取得完了', { count: result.length });

    return { ok: true, jobTypes: result };
  } catch (error) {
    logger.error('予期せぬエラー', error as Error);
    return { ok: false, error: '予期せぬエラーが発生しました' };
  }
}