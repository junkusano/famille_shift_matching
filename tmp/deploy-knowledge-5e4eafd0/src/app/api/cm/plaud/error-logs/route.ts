// =============================================================
// src/app/api/cm/plaud/error-logs/route.ts
// Chrome拡張エラーログ受信API
// =============================================================
// POST /api/cm/plaud/error-logs
//
// Chrome拡張機能で発生したエラーを受信し、audit.system_logs に記録する。
// DB保存は createLogger の warn/error が自動的に行うため、
// supabaseAdmin による直接INSERT は不要。
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/common/logger';
import { requirePlaudAuth, isAuthError } from '@/lib/cm/plaud/auth';
import { cmPlaudCorsHeaders } from '@/lib/cm/plaud/cors';

const logger = createLogger('cm/plaud/extension-error');

// =============================================================
// CORS設定
// =============================================================

const corsHeaders = cmPlaudCorsHeaders('POST, OPTIONS');

// =============================================================
// 定数
// =============================================================

/** 許可する severity 値 */
const ALLOWED_SEVERITIES = ['warn', 'error', 'critical'] as const;
type Severity = (typeof ALLOWED_SEVERITIES)[number];

/** error_message の最大文字数 */
const MAX_ERROR_MESSAGE_LENGTH = 2000;

/** error_code の最大文字数 */
const MAX_ERROR_CODE_LENGTH = 100;

/** error_context の最大JSONサイズ（バイト） */
const MAX_CONTEXT_SIZE = 10000;

// =============================================================
// 型定義
// =============================================================

type ErrorLogRequestBody = {
  error_code: string;
  error_message: string;
  severity: Severity;
  error_context?: Record<string, unknown>;
  extension_version?: string;
  browser_info?: string;
  occurred_at: string;
};

type ErrorLogSuccessResponse = {
  ok: true;
};

type ErrorLogErrorResponse = {
  ok: false;
  error: string;
};

type ErrorLogResponse = ErrorLogSuccessResponse | ErrorLogErrorResponse;

// =============================================================
// バリデーション
// =============================================================

function validateRequestBody(
  body: unknown
): { valid: true; data: ErrorLogRequestBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const {
    error_code,
    error_message,
    severity,
    error_context,
    extension_version,
    browser_info,
    occurred_at,
  } = body as Record<string, unknown>;

  // error_code: 必須・文字列
  if (!error_code || typeof error_code !== 'string') {
    return { valid: false, error: 'error_code is required' };
  }
  if (error_code.length > MAX_ERROR_CODE_LENGTH) {
    return { valid: false, error: `error_code must be ${MAX_ERROR_CODE_LENGTH} characters or less` };
  }

  // error_message: 必須・文字列
  if (!error_message || typeof error_message !== 'string') {
    return { valid: false, error: 'error_message is required' };
  }
  if (error_message.length > MAX_ERROR_MESSAGE_LENGTH) {
    return { valid: false, error: `error_message must be ${MAX_ERROR_MESSAGE_LENGTH} characters or less` };
  }

  // severity: 任意・デフォルト 'error'
  let validatedSeverity: Severity = 'error';
  if (severity !== undefined) {
    if (typeof severity !== 'string' || !ALLOWED_SEVERITIES.includes(severity as Severity)) {
      return { valid: false, error: `severity must be one of: ${ALLOWED_SEVERITIES.join(', ')}` };
    }
    validatedSeverity = severity as Severity;
  }

  // error_context: 任意・オブジェクト・サイズ制限
  if (error_context !== undefined) {
    if (typeof error_context !== 'object' || Array.isArray(error_context) || error_context === null) {
      return { valid: false, error: 'error_context must be an object' };
    }
    const contextSize = JSON.stringify(error_context).length;
    if (contextSize > MAX_CONTEXT_SIZE) {
      return { valid: false, error: `error_context must be ${MAX_CONTEXT_SIZE} bytes or less` };
    }
  }

  // extension_version: 任意・文字列
  if (extension_version !== undefined && typeof extension_version !== 'string') {
    return { valid: false, error: 'extension_version must be a string' };
  }

  // browser_info: 任意・文字列
  if (browser_info !== undefined && typeof browser_info !== 'string') {
    return { valid: false, error: 'browser_info must be a string' };
  }

  // occurred_at: 必須・ISO8601形式
  if (!occurred_at || typeof occurred_at !== 'string') {
    return { valid: false, error: 'occurred_at is required' };
  }
  const date = new Date(occurred_at);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'occurred_at must be a valid ISO8601 date' };
  }

  return {
    valid: true,
    data: {
      error_code,
      error_message: error_message as string,
      severity: validatedSeverity,
      error_context: error_context as Record<string, unknown> | undefined,
      extension_version: extension_version as string | undefined,
      browser_info: browser_info as string | undefined,
      occurred_at: occurred_at as string,
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
// POST: エラーログ受信
// =============================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<ErrorLogResponse>> {
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

    const {
      error_code,
      error_message,
      severity,
      error_context,
      extension_version,
      browser_info,
      occurred_at,
    } = validation.data;

    // ---------------------------------------------------------
    // 3. audit.system_logs に記録（createLogger 経由）
    // ---------------------------------------------------------
    // createLogger の warn/error は自動的に audit.system_logs へ保存される。
    // module='cm/plaud/extension-error' で他のログと区別可能。
    const logContext = {
      error_code,
      error_message,
      user_id: userId,
      extension_version: extension_version ?? null,
      browser_info: browser_info ?? null,
      occurred_at,
      ext_context: error_context ?? null,
    };

    if (severity === 'warn') {
      logger.warn(`[${error_code}] ${error_message}`, logContext);
    } else {
      // 'error' と 'critical' はどちらも logger.error で記録
      logger.error(`[${error_code}] ${error_message}`, undefined, logContext);
    }

    // ---------------------------------------------------------
    // 4. レスポンス
    // ---------------------------------------------------------
    return NextResponse.json(
      { ok: true },
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
