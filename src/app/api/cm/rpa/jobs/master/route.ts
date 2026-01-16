// =============================================================
// src/app/api/cm/rpa/jobs/master/route.ts
// RPA ジョブマスタ取得 API（管理画面用）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type { CmJobMasterResponse } from '@/types/cm/jobs';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/rpa/jobs/master');

// =============================================================
// APIキー認証
// =============================================================

async function validateApiKey(request: NextRequest): Promise<boolean> {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from('cm_rpa_api_keys')
    .select('id')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .limit(1)
    .single();

  return !error && !!data;
}

// =============================================================
// GET /api/cm/rpa/jobs/master - マスタ取得
// =============================================================

export async function GET(request: NextRequest): Promise<NextResponse<CmJobMasterResponse>> {
  try {
    // 1. APIキー認証
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. クエリパラメータ取得（オプション：特定キューのみ取得）
    const { searchParams } = new URL(request.url);
    const queueCode = searchParams.get('queue');

    logger.info('マスタ取得', { queueCode });

    // 3. キュー一覧取得
    const { data: queues, error: queuesError } = await supabaseAdmin
      .from('cm_job_queues')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (queuesError) {
      logger.error('キュー取得エラー', {
        message: queuesError.message,
        code: queuesError.code,
      });
      return NextResponse.json(
        { ok: false, error: 'キュー一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    // 4. ジョブタイプ一覧取得
    let jobTypesQuery = supabaseAdmin
      .from('cm_job_types')
      .select('*')
      .eq('is_active', true);

    // 特定キューでフィルタ
    if (queueCode) {
      jobTypesQuery = jobTypesQuery.eq('queue_code', queueCode);
    }

    const { data: jobTypes, error: jobTypesError } = await jobTypesQuery
      .order('queue_code', { ascending: true })
      .order('sort_order', { ascending: true });

    if (jobTypesError) {
      logger.error('ジョブタイプ取得エラー', {
        message: jobTypesError.message,
        code: jobTypesError.code,
      });
      return NextResponse.json(
        { ok: false, error: 'ジョブタイプ一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    logger.info('マスタ取得完了', {
      queueCount: queues?.length,
      jobTypeCount: jobTypes?.length,
    });

    // 5. 成功レスポンス
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