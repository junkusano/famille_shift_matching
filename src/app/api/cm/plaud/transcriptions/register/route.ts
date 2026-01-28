// =============================================================
// src/app/api/cm/plaud/transcriptions/register/route.ts
// 録音1件登録API
// =============================================================
// POST /api/cm/plaud/transcriptions/register
//
// Plaudから取得した録音を1件ずつDBに登録する。
// 既に登録済みの場合はスキップ（result: "exists"）。
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { requirePlaudAuth, isAuthError } from '@/lib/cm/plaud/auth';

const logger = createLogger('cm/plaud/transcriptions/register');

// =============================================================
// CORS設定
// =============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-plaud-account',
};

// =============================================================
// 型定義
// =============================================================

type RegisterRequestBody = {
  plaud_uuid: string;
  title: string;
  plaud_created_at: string;
};

type RegisterSuccessResponse = {
  ok: true;
  result: 'created' | 'exists';
  id: number;
};

type RegisterErrorResponse = {
  ok: false;
  error: string;
};

type RegisterResponse = RegisterSuccessResponse | RegisterErrorResponse;

// =============================================================
// バリデーション
// =============================================================

function validateRequestBody(
  body: unknown
): { valid: true; data: RegisterRequestBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const { plaud_uuid, title, plaud_created_at } = body as Record<string, unknown>;

  if (!plaud_uuid || typeof plaud_uuid !== 'string') {
    return { valid: false, error: 'plaud_uuid is required' };
  }

  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'title is required' };
  }

  if (!plaud_created_at || typeof plaud_created_at !== 'string') {
    return { valid: false, error: 'plaud_created_at is required' };
  }

  // ISO8601形式の簡易チェック
  const date = new Date(plaud_created_at);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'plaud_created_at must be a valid ISO8601 date' };
  }

  return {
    valid: true,
    data: { plaud_uuid, title, plaud_created_at },
  };
}

// =============================================================
// OPTIONS: プリフライトリクエスト
// =============================================================

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// =============================================================
// POST: 録音登録
// =============================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<RegisterResponse>> {
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

    const { userId } = auth;

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

    const { plaud_uuid, title, plaud_created_at } = validation.data;

    // ---------------------------------------------------------
    // 3. 既存レコード確認
    // ---------------------------------------------------------
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('cm_plaud_mgmt_transcriptions')
      .select('id')
      .eq('plaud_uuid', plaud_uuid)
      .limit(1)
      .maybeSingle();

    if (selectError) {
      logger.error('既存レコード確認エラー', { error: selectError.message });
      return NextResponse.json(
        { ok: false, error: 'Internal Server Error' },
        { status: 500, headers: corsHeaders }
      );
    }

    // 既存レコードがある場合はスキップ
    if (existing) {
      logger.info('既存レコードのためスキップ', { plaud_uuid, id: existing.id });
      return NextResponse.json(
        {
          ok: true,
          result: 'exists',
          id: existing.id,
        },
        { headers: corsHeaders }
      );
    }

    // ---------------------------------------------------------
    // 4. 新規登録
    // ---------------------------------------------------------
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('cm_plaud_mgmt_transcriptions')
      .insert({
        plaud_uuid,
        title,
        plaud_created_at,
        status: 'pending',
        retry_count: 0,
        registered_by: userId,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      logger.error('レコード登録エラー', { error: insertError?.message });
      return NextResponse.json(
        { ok: false, error: 'Internal Server Error' },
        { status: 500, headers: corsHeaders }
      );
    }

    logger.info('レコード登録成功', {
      plaud_uuid,
      id: inserted.id,
      registered_by: userId,
    });

    return NextResponse.json(
      {
        ok: true,
        result: 'created',
        id: inserted.id,
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