// =============================================================
// src/app/api/cm/rpa/logs/route.ts
// RPA ログ保存 API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import type { CmRpaLogRequest, CmRpaLogsApiResponse } from '@/types/cm/rpa';

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

  if (error || !data) {
    return false;
  }

  return true;
}

// =============================================================
// バリデーション
// =============================================================

const VALID_LEVELS = ['info', 'warn', 'error'] as const;
const VALID_ENVS = ['production', 'preview', 'development'] as const;

type ValidationResult =
  | { valid: true; data: CmRpaLogRequest }
  | { valid: false; error: string };

function validateLogRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'リクエストボディが不正です' };
  }

  const req = body as Record<string, unknown>;

  // 必須フィールド
  if (typeof req.timestamp !== 'string') {
    return { valid: false, error: 'timestamp は必須です（ISO 8601形式）' };
  }
  if (!VALID_LEVELS.includes(req.level as typeof VALID_LEVELS[number])) {
    return { valid: false, error: 'level は info/warn/error のいずれかです' };
  }
  if (!VALID_ENVS.includes(req.env as typeof VALID_ENVS[number])) {
    return { valid: false, error: 'env は production/preview/development のいずれかです' };
  }
  if (typeof req.module !== 'string' || req.module.length === 0) {
    return { valid: false, error: 'module は必須です' };
  }
  if (typeof req.message !== 'string' || req.message.length === 0) {
    return { valid: false, error: 'message は必須です' };
  }

  // オプションフィールドの型チェック
  if (req.action !== undefined && req.action !== null && typeof req.action !== 'string') {
    return { valid: false, error: 'action は文字列または null です' };
  }
  if (req.trace_id !== undefined && req.trace_id !== null && typeof req.trace_id !== 'string') {
    return { valid: false, error: 'trace_id は文字列または null です' };
  }
  if (req.context !== undefined && req.context !== null && typeof req.context !== 'object') {
    return { valid: false, error: 'context はオブジェクトまたは null です' };
  }
  if (req.error_name !== undefined && req.error_name !== null && typeof req.error_name !== 'string') {
    return { valid: false, error: 'error_name は文字列または null です' };
  }
  if (req.error_message !== undefined && req.error_message !== null && typeof req.error_message !== 'string') {
    return { valid: false, error: 'error_message は文字列または null です' };
  }
  if (req.error_stack !== undefined && req.error_stack !== null && typeof req.error_stack !== 'string') {
    return { valid: false, error: 'error_stack は文字列または null です' };
  }

  return {
    valid: true,
    data: {
      timestamp: req.timestamp as string,
      level: req.level as CmRpaLogRequest['level'],
      env: req.env as CmRpaLogRequest['env'],
      module: req.module as string,
      action: (req.action as string) ?? null,
      message: req.message as string,
      trace_id: (req.trace_id as string) ?? null,
      context: (req.context as Record<string, unknown>) ?? null,
      error_name: (req.error_name as string) ?? null,
      error_message: (req.error_message as string) ?? null,
      error_stack: (req.error_stack as string) ?? null,
    },
  };
}

// =============================================================
// POST /api/cm/rpa/logs
// =============================================================

export async function POST(request: NextRequest): Promise<NextResponse<CmRpaLogsApiResponse>> {
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

    // 3. バリデーション
    const validation = validateLogRequest(body);
    if (!validation.valid) {
      const errorResult = validation as { valid: false; error: string };
      return NextResponse.json(
        { ok: false, error: errorResult.error },
        { status: 400 }
      );
    }

    // 4. DB保存
    const logData = validation.data;
    const { error: insertError } = await supabaseAdmin
      .from('cm_rpa_logs')
      .insert({
        timestamp: logData.timestamp,
        level: logData.level,
        env: logData.env,
        module: logData.module,
        action: logData.action,
        message: logData.message,
        trace_id: logData.trace_id,
        context: logData.context,
        error_name: logData.error_name,
        error_message: logData.error_message,
        error_stack: logData.error_stack,
      });

    if (insertError) {
      console.error('[RPA logs] DB insert error:', insertError);
      return NextResponse.json(
        { ok: false, error: 'ログの保存に失敗しました' },
        { status: 500 }
      );
    }

    // 5. 成功レスポンス
    return NextResponse.json({ ok: true });

  } catch (error) {
    console.error('[RPA logs] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}