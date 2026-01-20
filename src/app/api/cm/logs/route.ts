// =============================================================
// src/app/api/cm/rpa/logs/route.ts
// RPA ログ API（保存 + 取得）
// =============================================================
//
// ※ 既存のPOSTメソッドに加えて、GETメソッドを追加
//
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import type { CmRpaLogRequest, CmRpaLogsApiResponse } from '@/types/cm/rpa';
import type { CmRpaLogsListResponse } from '@/types/cm/rpaLogs';

// =============================================================
// APIキー認証（既存）
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
// バリデーション（既存）
// =============================================================

const VALID_LEVELS = ['info', 'warn', 'error', 'debug'] as const;
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
    return { valid: false, error: 'level は info/warn/error/debug のいずれかです' };
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
// GET /api/cm/rpa/logs - ログ一覧取得（新規追加）
// =============================================================

export async function GET(request: NextRequest): Promise<NextResponse<CmRpaLogsListResponse>> {
  try {
    const { searchParams } = new URL(request.url);

    // クエリパラメータ取得
    const env = searchParams.get('env');
    const level = searchParams.get('level');
    const moduleName = searchParams.get('module');
    const message = searchParams.get('message');
    const traceId = searchParams.get('traceId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = 50;
    const offset = (page - 1) * limit;

    // クエリ構築
    let query = supabaseAdmin
      .from('cm_rpa_logs')
      .select('*', { count: 'exact' });

    // フィルター適用
    if (env && VALID_ENVS.includes(env as typeof VALID_ENVS[number])) {
      query = query.eq('env', env);
    }

    if (level && VALID_LEVELS.includes(level as typeof VALID_LEVELS[number])) {
      query = query.eq('level', level);
    }

    if (moduleName) {
      query = query.ilike('module', `%${moduleName}%`);
    }

    if (message) {
      query = query.ilike('message', `%${message}%`);
    }

    if (traceId) {
      query = query.eq('trace_id', traceId);
    }

    if (from) {
      query = query.gte('timestamp', from);
    }

    if (to) {
      query = query.lte('timestamp', to);
    }

    // ソート・ページネーション
    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    // 実行
    const { data: logs, error, count } = await query;

    if (error) {
      console.error('[RPA logs] DB query error:', error);
      return NextResponse.json(
        { ok: false, error: 'ログ取得に失敗しました' },
        { status: 500 }
      );
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      ok: true,
      logs: logs ?? [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('[RPA logs] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}

// =============================================================
// POST /api/cm/rpa/logs - ログ保存（既存）
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
