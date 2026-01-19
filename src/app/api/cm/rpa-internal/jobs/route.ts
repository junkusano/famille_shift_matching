// =============================================================
// src/app/api/cm/rpa-internal/jobs/route.ts
// RPA ジョブ管理 内部API（管理画面用）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/common/logger';
import { supabaseAdmin } from '@/lib/supabase/service';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/rpa-internal/jobs');

// =============================================================
// 定数
// =============================================================

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// =============================================================
// GET /api/cm/rpa-internal/jobs - ジョブ一覧取得
// =============================================================

export async function GET(request: NextRequest) {
  try {
    // 1. クエリパラメータ取得
    const { searchParams } = new URL(request.url);
    const queue = searchParams.get('queue');
    const status = searchParams.get('status');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = Math.min(
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)),
      MAX_LIMIT
    );
    const offset = Math.max(0, parseInt(offsetParam || '0', 10));

    logger.info('ジョブ一覧取得', { queue, status, limit, offset });

    // 2. クエリ構築
    let query = supabaseAdmin
      .from('cm_jobs_with_progress')
      .select('*', { count: 'exact' });

    if (queue) {
      query = query.eq('queue', queue);
    }
    if (status) {
      query = query.eq('status', status);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 3. 実行
    const { data: jobs, count, error: queryError } = await query;

    if (queryError) {
      logger.error('ジョブ一覧取得エラー', { message: queryError.message });
      return NextResponse.json(
        { ok: false, error: 'ジョブ一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      jobs: jobs || [],
      total: count || 0,
    });

  } catch (error) {
    logger.error('ジョブ一覧取得例外', error as Error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}

// =============================================================
// POST /api/cm/rpa-internal/jobs - ジョブ作成
// =============================================================

export async function POST(request: NextRequest) {
  try {
    // 1. リクエストボディ取得
    let body: { queue?: string; job_type?: string; payload?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    const { queue, job_type, payload = {} } = body;

    // 2. バリデーション
    if (!queue || typeof queue !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'queue は必須です' },
        { status: 400 }
      );
    }
    if (!job_type || typeof job_type !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'job_type は必須です' },
        { status: 400 }
      );
    }

    logger.info('ジョブ作成開始', { queue, job_type });

    // 3. マスタ存在チェック
    const { data: queueData } = await supabaseAdmin
      .from('cm_job_queues')
      .select('id')
      .eq('code', queue)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!queueData) {
      return NextResponse.json(
        { ok: false, error: `無効なキュー: ${queue}` },
        { status: 400 }
      );
    }

    const { data: jobTypeData } = await supabaseAdmin
      .from('cm_job_types')
      .select('id')
      .eq('queue_code', queue)
      .eq('code', job_type)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!jobTypeData) {
      return NextResponse.json(
        { ok: false, error: `無効なジョブタイプ: ${job_type}` },
        { status: 400 }
      );
    }

    // 4. アクティブなジョブの存在チェック
    const { data: existingJob } = await supabaseAdmin
      .from('cm_jobs')
      .select('id')
      .eq('queue', queue)
      .eq('job_type', job_type)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .single();

    if (existingJob) {
      return NextResponse.json(
        {
          ok: false,
          error: '同じタイプのアクティブなジョブが既に存在します',
          existing_job_id: existingJob.id,
        },
        { status: 409 }
      );
    }

    // 5. ジョブ作成
    const { data: newJob, error: insertError } = await supabaseAdmin
      .from('cm_jobs')
      .insert({
        queue,
        job_type,
        payload,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { ok: false, error: 'アクティブなジョブが既に存在します' },
          { status: 409 }
        );
      }
      logger.error('ジョブ作成エラー', { message: insertError.message });
      return NextResponse.json(
        { ok: false, error: 'ジョブの作成に失敗しました' },
        { status: 500 }
      );
    }

    logger.info('ジョブ作成完了', { jobId: newJob.id });

    return NextResponse.json(
      { ok: true, job: newJob },
      { status: 201 }
    );

  } catch (error) {
    logger.error('ジョブ作成例外', error as Error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}