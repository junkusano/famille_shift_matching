// =============================================================
// src/app/api/cm/rpa-internal/jobs/[id]/route.ts
// RPA ジョブ詳細・更新 内部API（管理画面用）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/common/logger';
import { supabaseAdmin } from '@/lib/supabase/service';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/rpa-internal/jobs/[id]');

// =============================================================
// 型定義
// =============================================================

type RouteContext = {
  params: Promise<{ id: string }>;
};

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

const VALID_STATUSES: JobStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled'];

// =============================================================
// GET /api/cm/rpa-internal/jobs/:id - ジョブ詳細取得
// =============================================================

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    // 1. パラメータ取得
    const { id } = await context.params;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { ok: false, error: '無効なジョブIDです' },
        { status: 400 }
      );
    }

    logger.info('ジョブ詳細取得', { jobId });

    // 2. ジョブ取得
    const { data: job, error: jobError } = await supabaseAdmin
      .from('cm_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: 'ジョブが見つかりません' },
        { status: 404 }
      );
    }

    // 3. アイテム取得
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('cm_job_items')
      .select('*')
      .eq('job_id', jobId)
      .order('id', { ascending: true });

    if (itemsError) {
      logger.error('アイテム取得エラー', { message: itemsError.message });
    }

    // 4. 進捗計算
    const itemList = items || [];
    const total = itemList.length;
    const completed = itemList.filter((i) => i.status === 'completed').length;
    const failed = itemList.filter((i) => i.status === 'failed').length;
    const pending = itemList.filter((i) => i.status === 'pending').length;
    const percent = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

    const progress = {
      total,
      completed,
      failed,
      pending,
      percent,
    };

    return NextResponse.json({
      ok: true,
      job,
      items: itemList,
      progress,
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
// PUT /api/cm/rpa-internal/jobs/:id - ジョブ更新
// =============================================================

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    // 1. パラメータ取得
    const { id } = await context.params;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { ok: false, error: '無効なジョブIDです' },
        { status: 400 }
      );
    }

    // 2. リクエストボディ取得
    let body: {
      status?: string;
      progress_message?: string;
      error_message?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    // 3. バリデーション
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status as JobStatus)) {
        return NextResponse.json(
          { ok: false, error: `無効なステータス: ${body.status}` },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }

    if (body.progress_message !== undefined) {
      updates.progress_message = body.progress_message;
    }

    if (body.error_message !== undefined) {
      updates.error_message = body.error_message;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: '更新する項目がありません' },
        { status: 400 }
      );
    }

    logger.info('ジョブ更新開始', { jobId, updates });

    // 4. 更新実行
    const { data: updatedJob, error: updateError } = await supabaseAdmin
      .from('cm_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single();

    if (updateError) {
      logger.error('ジョブ更新エラー', { message: updateError.message });
      return NextResponse.json(
        { ok: false, error: 'ジョブの更新に失敗しました' },
        { status: 500 }
      );
    }

    if (!updatedJob) {
      return NextResponse.json(
        { ok: false, error: 'ジョブが見つかりません' },
        { status: 404 }
      );
    }

    logger.info('ジョブ更新完了', { jobId });

    return NextResponse.json({
      ok: true,
      job: updatedJob,
    });

  } catch (error) {
    logger.error('ジョブ更新例外', error as Error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}