// =============================================================
// src/app/api/cm/rpa-internal/jobs/master/route.ts
// RPA ジョブマスタ取得 内部API（管理画面用）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/common/logger';
import { supabaseAdmin } from '@/lib/supabase/service';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/rpa-internal/jobs/master');

// =============================================================
// GET /api/cm/rpa-internal/jobs/master - マスタ取得
// =============================================================

export async function GET(request: NextRequest) {
  try {
    // 1. クエリパラメータ取得
    const { searchParams } = new URL(request.url);
    const queueCode = searchParams.get('queue');

    logger.info('マスタ取得', { queueCode });

    // 2. キュー一覧取得
    const { data: queues, error: queuesError } = await supabaseAdmin
      .from('cm_job_queues')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (queuesError) {
      logger.error('キュー取得エラー', { message: queuesError.message });
      return NextResponse.json(
        { ok: false, error: 'キュー一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    // 3. ジョブタイプ一覧取得
    let jobTypesQuery = supabaseAdmin
      .from('cm_job_types')
      .select('*')
      .eq('is_active', true);

    if (queueCode) {
      jobTypesQuery = jobTypesQuery.eq('queue_code', queueCode);
    }

    const { data: jobTypes, error: jobTypesError } = await jobTypesQuery
      .order('queue_code', { ascending: true })
      .order('sort_order', { ascending: true });

    if (jobTypesError) {
      logger.error('ジョブタイプ取得エラー', { message: jobTypesError.message });
      return NextResponse.json(
        { ok: false, error: 'ジョブタイプ一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      queues: queues || [],
      jobTypes: jobTypes || [],
    });

  } catch (error) {
    logger.error('マスタ取得例外', error as Error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}