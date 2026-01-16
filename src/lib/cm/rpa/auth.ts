// =============================================================
// src/lib/cm/rpa/auth.ts
// RPA API 共通認証ライブラリ
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

// =============================================================
// 型定義
// =============================================================

/**
 * APIキー検証結果
 */
export type ApiKeyValidationResult = {
  valid: boolean;
  keyId?: number;
  keyName?: string;
};

/**
 * 認証エラーレスポンス
 */
export type AuthErrorResponse = {
  ok: false;
  error: string;
};

// =============================================================
// APIキー検証
// =============================================================

/**
 * APIキーを検証する
 * @param request NextRequest オブジェクト
 * @returns 検証結果
 */
export async function validateApiKey(request: NextRequest): Promise<boolean> {
  const result = await validateApiKeyWithDetails(request);
  return result.valid;
}

/**
 * APIキーを検証する（詳細情報付き）
 * @param request NextRequest オブジェクト
 * @returns 検証結果（キーID、キー名を含む）
 */
export async function validateApiKeyWithDetails(
  request: NextRequest
): Promise<ApiKeyValidationResult> {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
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
    return { valid: false };
  }

  return {
    valid: true,
    keyId: data.id,
    keyName: data.key_name,
  };
}

// =============================================================
// 認証エラーレスポンス生成
// =============================================================

/**
 * 401 Unauthorized レスポンスを生成
 */
export function unauthorizedResponse(): NextResponse<AuthErrorResponse> {
  return NextResponse.json(
    { ok: false, error: 'Unauthorized' },
    { status: 401 }
  );
}

// =============================================================
// 認証ガード（ヘルパー関数）
// =============================================================

/**
 * APIキー認証を行い、失敗時は401レスポンスを返す
 * @param request NextRequest オブジェクト
 * @returns 認証成功時はnull、失敗時はNextResponse
 * 
 * @example
 * const authError = await requireApiKey(request);
 * if (authError) return authError;
 */
export async function requireApiKey(
  request: NextRequest
): Promise<NextResponse<AuthErrorResponse> | null> {
  const isValid = await validateApiKey(request);
  if (!isValid) {
    return unauthorizedResponse();
  }
  return null;
}

/**
 * APIキー認証を行い、詳細情報を返す
 * @param request NextRequest オブジェクト
 * @returns 認証成功時は詳細情報、失敗時はNextResponse
 * 
 * @example
 * const auth = await requireApiKeyWithDetails(request);
 * if ('ok' in auth) return auth; // エラーレスポンス
 * console.log(`Key: ${auth.keyName}`);
 */
export async function requireApiKeyWithDetails(
  request: NextRequest
): Promise<ApiKeyValidationResult | NextResponse<AuthErrorResponse>> {
  const result = await validateApiKeyWithDetails(request);
  if (!result.valid) {
    return unauthorizedResponse();
  }
  return result;
}
