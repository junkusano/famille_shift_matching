// =============================================================
// src/lib/cm/scheduled-jobs/getAvailableJobTypes.ts
// 定期実行に未設定のジョブタイプ一覧取得（追加モーダル用）
// =============================================================

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type {
  CmAvailableJobType,
  GetAvailableJobTypesResult,
} from '@/types/cm/scheduledJobs';

const logger = createLogger('lib/cm/scheduled-jobs/getAvailableJobTypes');

/**
 * 定期実行に未設定のジョブタイプ一覧を取得
 * is_scheduled = false または null のもの
 */
export async function getAvailableJobTypes(): Promise<GetAvailableJobTypesResult> {
  try {
    logger.info('未設定ジョブタイプ一覧取得開始');

    // ジョブタイプ + キュー情報を取得（is_scheduled が false または null）
    const { data: jobTypes, error } = await supabaseAdmin
      .from('cm_job_types')
      .select(`
        id,
        queue_code,
        code,
        name,
        is_scheduled,
        cm_job_queues (
          name
        )
      `)
      .eq('is_active', true)
      .or('is_scheduled.eq.false,is_scheduled.is.null')
      .order('queue_code', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) {
      logger.error('ジョブタイプ取得エラー', { message: error.message, code: error.code });
      return { ok: false, error: error.message };
    }

    // レスポンス整形
    const result: CmAvailableJobType[] = (jobTypes ?? []).map((jt) => {
      const queue = jt.cm_job_queues as { name: string }[] | { name: string } | null;
      const queueName = Array.isArray(queue) ? queue[0]?.name : queue?.name;
      return {
        id: jt.id,
        queue_code: jt.queue_code,
        code: jt.code,
        name: jt.name,
        queue_name: queueName ?? jt.queue_code,
      };
    });

    logger.info('未設定ジョブタイプ一覧取得完了', { count: result.length });

    return { ok: true, jobTypes: result };
  } catch (error) {
    logger.error('予期せぬエラー', error as Error);
    return { ok: false, error: '予期せぬエラーが発生しました' };
  }
}