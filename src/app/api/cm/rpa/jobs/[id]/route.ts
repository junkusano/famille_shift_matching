// =============================================================
// src/app/api/cm/rpa/jobs/[id]/route.ts
// RPA ジョブ詳細 API（取得・更新）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type {
  CmJob,
  CmJobItem,
  CmJobStatus,
  CmJobDetailResponse,
  CmUpdateJobResponse,
  CmUpdateJobRequest,
} from '@/types/cm/jobs';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/rpa/jobs/[id]');

// =============================================================
// 定数
// =============================================================

const VALID_STATUSES: readonly CmJobStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled'];

// =============================================================
// 型定義
// =============================================================

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
// バリデーション
// =============================================================

type UpdateJobValidationResult =
  | { valid: true; data: CmUpdateJobRequest }
  | { valid: false; error: string };

function validateUpdateJobRequest(body: unknown): UpdateJobValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'リクエストボディが不正です' };
  }

  const req = body as Record<string, unknown>;
  const updates: CmUpdateJobRequest = {};

  // status（オプション）
  if (req.status !== undefined) {
    if (typeof req.status !== 'string') {
      return { valid: false, error: 'status は文字列です' };
    }
    if (!VALID_STATUSES.includes(req.status as CmJobStatus)) {
      return { valid: false, error: `status は ${VALID_STATUSES.join(', ')} のいずれかです` };
    }
    updates.status = req.status as CmJobStatus;
  }

  // progress_message（オプション）
  if (req.progress_message !== undefined) {
    if (req.progress_message !== null && typeof req.progress_message !== 'string') {
      return { valid: false, error: 'progress_message は文字列または null です' };
    }
    updates.progress_message = req.progress_message as string;
  }

  // error_message（オプション）
  if (req.error_message !== undefined) {
    if (req.error_message !== null && typeof req.error_message !== 'string') {
      return { valid: false, error: 'error_message は文字列または null です' };
    }
    updates.error_message = req.error_message as string;
  }

  // result（オプション）
  if (req.result !== undefined) {
    if (req.result !== null && typeof req.result !== 'object') {
      return { valid: false, error: 'result はオブジェクトまたは null です' };
    }
    updates.result = req.result as Record<string, unknown>;
  }

  // 更新項目が1つもない場合
  if (Object.keys(updates).length === 0) {
    return { valid: false, error: '更新する項目がありません' };
  }

  return { valid: true, data: updates };
}

// =============================================================
// GET /api/cm/rpa/jobs/:id - ジョブ詳細取得
// =============================================================

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<CmJobDetailResponse>> {
  try {
    // 1. APIキー認証
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. パラメータ取得
    const { id } = await context.params;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { ok: false, error: '無効なジョブIDです' },
        { status: 400 }
      );
    }

    logger.info('ジョブ詳細取得', { jobId });

    // 3. ジョブ取得
    const { data: job, error: jobError } = await supabaseAdmin
      .from('cm_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError) {
      if (jobError.code === 'PGRST116') {
        return NextResponse.json(
          { ok: false, error: 'ジョブが見つかりません' },
          { status: 404 }
        );
      }
      logger.error('ジョブ取得エラー', {
        message: jobError.message,
        code: jobError.code,
      });
      return NextResponse.json(
        { ok: false, error: 'ジョブの取得に失敗しました' },
        { status: 500 }
      );
    }

    // 4. アイテム取得
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('cm_job_items')
      .select('*')
      .eq('job_id', jobId)
      .order('id', { ascending: true });

    if (itemsError) {
      logger.warn('アイテム取得エラー', {
        message: itemsError.message,
        code: itemsError.code,
      });
    }

    // 5. 進捗計算
    const itemList = items || [];
    const total = itemList.length;
    const completed = itemList.filter((i) => i.status === 'completed').length;
    const failed = itemList.filter((i) => i.status === 'failed').length;
    const pending = itemList.filter((i) => i.status === 'pending').length;
    const percent = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    logger.info('ジョブ詳細取得完了', { jobId, itemCount: total });

    // 6. 成功レスポンス
    return NextResponse.json({
      ok: true,
      job: job as CmJob,
      items: itemList as CmJobItem[],
      progress: {
        total,
        completed,
        failed,
        pending,
        percent,
      },
    });

  } catch (error) {
    logger.error('ジョブ詳細取得例外', error as Error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}

// =============================================================
// PUT /api/cm/rpa/jobs/:id - ジョブ更新
// =============================================================

export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<CmUpdateJobResponse>> {
  try {
    // 1. APIキー認証
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. パラメータ取得
    const { id } = await context.params;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { ok: false, error: '無効なジョブIDです' },
        { status: 400 }
      );
    }

    // 3. リクエストボディ取得
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'リクエストボディのパースに失敗しました' },
        { status: 400 }
      );
    }

    // 4. バリデーション
    const validation = validateUpdateJobRequest(body);
    if (!validation.valid) {
      const errorResult = validation as { valid: false; error: string };
      return NextResponse.json(
        { ok: false, error: errorResult.error },
        { status: 400 }
      );
    }

    logger.info('ジョブ更新開始', { jobId, updates: validation.data });

    // 5. 更新実行
    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('cm_jobs')
      .update(validation.data)
      .eq('id', jobId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { ok: false, error: 'ジョブが見つかりません' },
          { status: 404 }
        );
      }
      logger.error('ジョブ更新エラー', {
        message: updateError.message,
        code: updateError.code,
      });
      return NextResponse.json(
        { ok: false, error: 'ジョブの更新に失敗しました' },
        { status: 500 }
      );
    }

    logger.info('ジョブ更新完了', { jobId, status: updatedJob.status });

    // 6. 成功レスポンス
    return NextResponse.json({
      ok: true,
      job: updatedJob as CmJob,
    });

  } catch (error) {
    logger.error('ジョブ更新例外', error as Error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}