// =============================================================
// src/app/api/cm/plaud/transcriptions/update/route.ts
// 文字起こし更新API
// =============================================================
// POST /api/cm/plaud/transcriptions/update
//
// 文字起こしの取得結果を1件ずつ更新する。
// - 成功時: status='completed', transcriptを保存
// - 失敗時: retry_count++, 3回でstatus='failed'
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { requirePlaudAuth, isAuthError } from '@/lib/cm/plaud/auth';

const logger = createLogger('cm/plaud/transcriptions/update');

// =============================================================
// CORS設定
// =============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-plaud-account',
};

// =============================================================
// 定数
// =============================================================

const MAX_RETRY_COUNT = 3;

// =============================================================
// 型定義
// =============================================================

type UpdateRequestBody = {
  plaud_uuid: string;
  success: boolean;
  transcript?: string;
  error_code?: string;
};

type UpdateSuccessResponse = {
  ok: true;
  result: 'completed' | 'retrying' | 'failed';
  id: number;
  retry_count?: number;
};

type UpdateErrorResponse = {
  ok: false;
  error: string;
};

type UpdateResponse = UpdateSuccessResponse | UpdateErrorResponse;

// =============================================================
// バリデーション
// =============================================================

function validateRequestBody(
  body: unknown
): { valid: true; data: UpdateRequestBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const { plaud_uuid, success, transcript, error_code } = body as Record<string, unknown>;

  if (!plaud_uuid || typeof plaud_uuid !== 'string') {
    return { valid: false, error: 'plaud_uuid is required' };
  }

  if (typeof success !== 'boolean') {
    return { valid: false, error: 'success must be a boolean' };
  }

  // success=trueの場合はtranscriptが必須
  if (success && (!transcript || typeof transcript !== 'string')) {
    return { valid: false, error: 'transcript is required when success is true' };
  }

  return {
    valid: true,
    data: {
      plaud_uuid,
      success,
      transcript: typeof transcript === 'string' ? transcript : undefined,
      error_code: typeof error_code === 'string' ? error_code : undefined,
    },
  };
}

// =============================================================
// OPTIONS: プリフライトリクエスト
// =============================================================

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// =============================================================
// POST: 文字起こし更新
// =============================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<UpdateResponse>> {
  try {
    // ---------------------------------------------------------
    // 1. 認証チェック
    // ---------------------------------------------------------
    const auth = await requirePlaudAuth(request);
    if (isAuthError(auth)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    // ---------------------------------------------------------
    // 2. リクエストボディ取得・バリデーション
    // ---------------------------------------------------------
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      logger.warn('リクエストボディのパースエラー');
      return NextResponse.json(
        { ok: false, error: 'Bad Request' },
        { status: 400, headers: corsHeaders }
      );
    }

    const validation = validateRequestBody(body);
    if (!validation.valid) {
      const errorResult = validation as { valid: false; error: string };
      logger.warn('バリデーションエラー', { error: errorResult.error });
      return NextResponse.json(
        { ok: false, error: `Validation error: ${errorResult.error}` },
        { status: 400, headers: corsHeaders }
      );
    }

    const { plaud_uuid, success, transcript, error_code } = validation.data;

    // ---------------------------------------------------------
    // 3. レコード取得
    // ---------------------------------------------------------
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('cm_plaud_mgmt_transcriptions')
      .select('id, retry_count, status')
      .eq('plaud_uuid', plaud_uuid)
      .limit(1)
      .maybeSingle();

    if (selectError) {
      logger.error('レコード取得エラー', { error: selectError.message });
      return NextResponse.json(
        { ok: false, error: 'Internal Server Error' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!existing) {
      logger.warn('レコードが見つからない', { plaud_uuid });
      return NextResponse.json(
        { ok: false, error: 'Record not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const recordId = existing.id;
    const currentRetryCount = existing.retry_count ?? 0;

    // ---------------------------------------------------------
    // 4. 成功時: status='completed', transcriptを保存
    // ---------------------------------------------------------
    if (success) {
      const { error: updateError } = await supabaseAdmin
        .from('cm_plaud_mgmt_transcriptions')
        .update({
          status: 'completed',
          transcript,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId);

      if (updateError) {
        logger.error('レコード更新エラー（成功時）', { error: updateError.message });
        return NextResponse.json(
          { ok: false, error: 'Internal Server Error' },
          { status: 500, headers: corsHeaders }
        );
      }

      logger.info('文字起こし取得成功', { plaud_uuid, id: recordId });

      return NextResponse.json(
        {
          ok: true,
          result: 'completed',
          id: recordId,
        },
        { headers: corsHeaders }
      );
    }

    // ---------------------------------------------------------
    // 5. 失敗時: retry_count++, 3回でstatus='failed'
    // ---------------------------------------------------------
    const newRetryCount = currentRetryCount + 1;
    const newStatus = newRetryCount >= MAX_RETRY_COUNT ? 'failed' : 'approved';

    const { error: updateError } = await supabaseAdmin
      .from('cm_plaud_mgmt_transcriptions')
      .update({
        status: newStatus,
        retry_count: newRetryCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordId);

    if (updateError) {
      logger.error('レコード更新エラー（失敗時）', { error: updateError.message });
      return NextResponse.json(
        { ok: false, error: 'Internal Server Error' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (newStatus === 'failed') {
      logger.warn('文字起こし取得失敗（上限到達）', {
        plaud_uuid,
        id: recordId,
        retry_count: newRetryCount,
        error_code,
      });

      return NextResponse.json(
        {
          ok: true,
          result: 'failed',
          id: recordId,
        },
        { headers: corsHeaders }
      );
    }

    logger.info('文字起こし取得失敗（リトライ継続）', {
      plaud_uuid,
      id: recordId,
      retry_count: newRetryCount,
      error_code,
    });

    return NextResponse.json(
      {
        ok: true,
        result: 'retrying',
        id: recordId,
        retry_count: newRetryCount,
      },
      { headers: corsHeaders }
    );

  } catch (error) {
    logger.error('予期せぬエラー', error as Error);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}