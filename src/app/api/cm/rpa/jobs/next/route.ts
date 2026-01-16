// =============================================================
// src/app/api/cm/rpa/jobs/next/route.ts
// RPA 次のジョブ取得 API（ワーカー用）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { validateApiKey } from '@/lib/cm/rpa/auth';
import type { CmNextJobResponse } from '@/types/cm/jobs';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/rpa/jobs/next');

// =============================================================
// マスタ検証
// =============================================================

/**
 * キューコードの存在確認
 */
async function isValidQueue(queueCode: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('cm_job_queues')
    .select('id')
    .eq('code', queueCode)
    .eq('is_active', true)
    .limit(1)
    .single();

  return !error && !!data;
}

// =============================================================
// GET /api/cm/rpa/jobs/next - 次のジョブ取得
// =============================================================

export async function GET(request: NextRequest): Promise<NextResponse<CmNextJobResponse>> {
  try {
    // 1. APIキー認証
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. クエリパラメータ取得
    const { searchParams } = new URL(request.url);
    const queue = searchParams.get('queue');

    // 3. バリデーション
    if (!queue) {
      return NextResponse.json(
        { ok: false, error: 'queue パラメータは必須です' },
        { status: 400 }
      );
    }

    // 4. マスタ存在チェック（DB参照）
    if (!(await isValidQueue(queue))) {
      return NextResponse.json(
        { ok: false, error: `無効なキュー: ${queue}` },
        { status: 400 }
      );
    }

    logger.info('次のジョブ取得', { queue });

    // 5. DB関数を使用してアトミックに取得・更新
    // get_next_job は pending のジョブを processing に更新して返す
    const { data, error } = await supabaseAdmin.rpc('get_next_job', {
      p_queue: queue,
    });

    if (error) {
      logger.error('次のジョブ取得エラー', {
        message: error.message,
        code: error.code,
      });
      return NextResponse.json(
        { ok: false, error: '次のジョブの取得に失敗しました' },
        { status: 500 }
      );
    }

    // 6. 結果が空配列または null の場合は null を返す
    const job = Array.isArray(data) ? data[0] || null : data || null;

    if (job) {
      logger.info('ジョブ取得成功', { jobId: job.id, jobType: job.job_type });
    } else {
      logger.info('待機中のジョブなし', { queue });
    }

    // 7. 成功レスポンス
    return NextResponse.json({
      ok: true,
      job,
    });

  } catch (error) {
    logger.error('次のジョブ取得例外', error as Error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}