// =============================================================
// src/app/api/cm/rpa/jobs/route.ts
// RPA ジョブ API（作成・一覧取得）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { validateApiKey } from '@/lib/cm/rpa/auth';
import type {
  CmCreateJobRequest,
  CmCreateJobResponse,
  CmJobListResponse,
} from '@/types/cm/jobs';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/rpa/jobs');

// =============================================================
// 定数
// =============================================================

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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

/**
 * ジョブタイプコードの存在確認
 */
async function isValidJobType(queueCode: string, jobTypeCode: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('cm_job_types')
    .select('id')
    .eq('queue_code', queueCode)
    .eq('code', jobTypeCode)
    .eq('is_active', true)
    .limit(1)
    .single();

  return !error && !!data;
}

// =============================================================
// バリデーション
// =============================================================

type CreateJobValidationResult =
  | { valid: true; data: CmCreateJobRequest }
  | { valid: false; error: string };

function validateCreateJobRequestFormat(body: unknown): CreateJobValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'リクエストボディが不正です' };
  }

  const req = body as Record<string, unknown>;

  // queue（必須）
  if (typeof req.queue !== 'string' || req.queue.trim() === '') {
    return { valid: false, error: 'queue は必須です' };
  }

  // job_type（必須）
  if (typeof req.job_type !== 'string' || req.job_type.trim() === '') {
    return { valid: false, error: 'job_type は必須です' };
  }

  // payload（オプション）
  if (req.payload !== undefined && req.payload !== null && typeof req.payload !== 'object') {
    return { valid: false, error: 'payload はオブジェクトまたは null です' };
  }

  return {
    valid: true,
    data: {
      queue: req.queue.trim(),
      job_type: req.job_type.trim(),
      payload: (req.payload as Record<string, unknown>) ?? {},
    },
  };
}

// =============================================================
// POST /api/cm/rpa/jobs - ジョブ作成
// =============================================================

export async function POST(request: NextRequest): Promise<NextResponse<CmCreateJobResponse>> {
  try {
    // 1. APIキー認証
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. リクエストボディ取得
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'リクエストボディのパースに失敗しました' },
        { status: 400 }
      );
    }

    // 3. フォーマットバリデーション
    const validation = validateCreateJobRequestFormat(body);
    if (!validation.valid) {
      const errorResult = validation as { valid: false; error: string };
      return NextResponse.json(
        { ok: false, error: errorResult.error },
        { status: 400 }
      );
    }

    const { queue, job_type, payload } = validation.data;

    logger.info('ジョブ作成開始', { queue, job_type });

    // 4. マスタ存在チェック（DB参照）
    if (!(await isValidQueue(queue))) {
      return NextResponse.json(
        { ok: false, error: `無効なキュー: ${queue}` },
        { status: 400 }
      );
    }

    if (!(await isValidJobType(queue, job_type))) {
      return NextResponse.json(
        { ok: false, error: `無効なジョブタイプ: ${job_type}（キュー: ${queue}）` },
        { status: 400 }
      );
    }

    // 5. アクティブなジョブの存在チェック
    const { data: existingJob } = await supabaseAdmin
      .from('cm_jobs')
      .select('id')
      .eq('queue', queue)
      .eq('job_type', job_type)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .single();

    if (existingJob) {
      logger.warn('アクティブなジョブが存在', { existingJobId: existingJob.id });
      return NextResponse.json(
        {
          ok: false,
          error: 'Active job already exists',
          existing_job_id: existingJob.id,
        },
        { status: 409 }
      );
    }

    // 6. ジョブ作成
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
      // ユニーク制約違反の場合（レースコンディション対策）
      if (insertError.code === '23505') {
        logger.warn('ジョブ作成競合', { queue, job_type });
        return NextResponse.json(
          { ok: false, error: 'Active job already exists' },
          { status: 409 }
        );
      }

      logger.error('ジョブ作成エラー', {
        message: insertError.message,
        code: insertError.code,
      });
      return NextResponse.json(
        { ok: false, error: 'ジョブの作成に失敗しました' },
        { status: 500 }
      );
    }

    logger.info('ジョブ作成完了', { jobId: newJob.id });

    // 7. 成功レスポンス
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

// =============================================================
// GET /api/cm/rpa/jobs - ジョブ一覧取得
// =============================================================

export async function GET(request: NextRequest): Promise<NextResponse<CmJobListResponse>> {
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
    const status = searchParams.get('status');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = Math.min(
      Math.max(1, parseInt(limitParam || String(DEFAULT_LIMIT), 10)),
      MAX_LIMIT
    );
    const offset = Math.max(0, parseInt(offsetParam || '0', 10));

    logger.info('ジョブ一覧取得', { queue, status, limit, offset });

    // 3. クエリ構築
    let query = supabaseAdmin
      .from('cm_jobs_with_progress')
      .select('*', { count: 'exact' });

    // フィルター適用（値があれば適用、マスタ存在チェックは省略）
    if (queue) {
      query = query.eq('queue', queue);
    }
    if (status) {
      query = query.eq('status', status);
    }

    // ソート・ページネーション
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 4. 実行
    const { data: jobs, count, error: queryError } = await query;

    if (queryError) {
      logger.error('ジョブ一覧取得エラー', {
        message: queryError.message,
        code: queryError.code,
      });
      return NextResponse.json(
        { ok: false, error: 'ジョブ一覧の取得に失敗しました' },
        { status: 500 }
      );
    }

    logger.info('ジョブ一覧取得完了', { count: jobs?.length, total: count });

    // 5. 成功レスポンス
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