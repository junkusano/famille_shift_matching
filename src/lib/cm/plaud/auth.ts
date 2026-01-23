// =============================================================
// src/lib/cm/plaud/auth.ts
// Plaud Chrome拡張機能用 認証ヘルパー関数
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';

const logger = createLogger('cm/plaud/auth');

// =============================================================
// 型定義
// =============================================================

/**
 * Plaud認証結果
 */
export type PlaudAuthResult = {
  valid: boolean;
  keyId?: number;
  keyName?: string;
  userId?: string;
};

/**
 * 認証エラーレスポンス
 */
export type PlaudAuthErrorResponse = {
  ok: false;
  error: string;
};

// =============================================================
// APIキー検証
// =============================================================

/**
 * APIキーを検証する
 * @param request NextRequest オブジェクト
 * @returns 検証結果（キーID、キー名を含む）
 */
async function validateApiKey(
  request: NextRequest
): Promise<{ valid: boolean; keyId?: number; keyName?: string }> {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    logger.warn('APIキーが未指定');
    return { valid: false };
  }

  const { data, error } = await supabaseAdmin
    .from('cm_rpa_api_keys')
    .select('id, key_name')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) {
    logger.warn('APIキー検証失敗', { error: error?.message });
    return { valid: false };
  }

  return {
    valid: true,
    keyId: data.id,
    keyName: data.key_name,
  };
}

// =============================================================
// アカウント検証
// =============================================================

/**
 * メールアドレスからuser_idを抽出する
 * @param email メールアドレス（例: yamada@example.com）
 * @returns user_id（例: yamada）
 */
function extractUserId(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) {
    // @がない場合はそのまま返す
    return email;
  }
  return email.substring(0, atIndex);
}

/**
 * Plaudアカウントを検証する
 * @param request NextRequest オブジェクト
 * @returns 検証結果（user_idを含む）
 */
async function validatePlaudAccount(
  request: NextRequest
): Promise<{ valid: boolean; userId?: string }> {
  const plaudAccount = request.headers.get('x-plaud-account');

  if (!plaudAccount) {
    logger.warn('Plaudアカウントが未指定');
    return { valid: false };
  }

  // メールアドレスからuser_idを抽出
  const userId = extractUserId(plaudAccount);

  if (!userId) {
    logger.warn('user_idの抽出に失敗', { plaudAccount });
    return { valid: false };
  }

  // usersテーブルで存在確認
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('user_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error || !data) {
    logger.warn('Plaudアカウント検証失敗', { userId, error: error?.message });
    return { valid: false };
  }

  return {
    valid: true,
    userId: data.user_id,
  };
}

// =============================================================
// Plaud認証（APIキー + アカウント）
// =============================================================

/**
 * Plaud認証を行う（APIキー + アカウント）
 * @param request NextRequest オブジェクト
 * @returns 検証結果
 */
export async function validatePlaudAuth(
  request: NextRequest
): Promise<PlaudAuthResult> {
  // 1. APIキー検証
  const apiKeyResult = await validateApiKey(request);
  if (!apiKeyResult.valid) {
    return { valid: false };
  }

  // 2. アカウント検証
  const accountResult = await validatePlaudAccount(request);
  if (!accountResult.valid) {
    return { valid: false };
  }

  logger.info('Plaud認証成功', {
    keyName: apiKeyResult.keyName,
    userId: accountResult.userId,
  });

  return {
    valid: true,
    keyId: apiKeyResult.keyId,
    keyName: apiKeyResult.keyName,
    userId: accountResult.userId,
  };
}

// =============================================================
// 認証エラーレスポンス生成
// =============================================================

/**
 * 401 Unauthorized レスポンスを生成
 */
export function unauthorizedResponse(): NextResponse<PlaudAuthErrorResponse> {
  return NextResponse.json(
    { ok: false, error: 'Unauthorized' },
    { status: 401 }
  );
}

// =============================================================
// 認証ガード（ヘルパー関数）
// =============================================================

/**
 * Plaud認証を行い、失敗時は401レスポンスを返す
 * @param request NextRequest オブジェクト
 * @returns 認証成功時はPlaudAuthResult、失敗時はNextResponse
 *
 * @example
 * const auth = await requirePlaudAuth(request);
 * if ('ok' in auth) return auth; // エラーレスポンス
 * console.log(`User: ${auth.userId}`);
 */
export async function requirePlaudAuth(
  request: NextRequest
): Promise<PlaudAuthResult | NextResponse<PlaudAuthErrorResponse>> {
  const result = await validatePlaudAuth(request);
  if (!result.valid) {
    return unauthorizedResponse();
  }
  return result;
}

/**
 * 認証結果がエラーレスポンスかどうかを判定する
 * @param result requirePlaudAuthの戻り値
 * @returns エラーレスポンスの場合true
 *
 * @example
 * const auth = await requirePlaudAuth(request);
 * if (isAuthError(auth)) return auth;
 * // ここではauthはPlaudAuthResult型
 */
export function isAuthError(
  result: PlaudAuthResult | NextResponse<PlaudAuthErrorResponse>
): result is NextResponse<PlaudAuthErrorResponse> {
  return result instanceof NextResponse;
}
