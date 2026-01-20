// =============================================================
// src/lib/cm/serviceCredentials.ts
// サービス認証情報取得ヘルパー（キャッシュ付き）
// =============================================================

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';

const logger = createLogger('cm/lib/serviceCredentials');

// キャッシュ設定
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

type CacheEntry = {
  value: Record<string, unknown> | null;
  expiresAt: number;
};

// メモリキャッシュ
const cache = new Map<string, CacheEntry>();

/**
 * サービス認証情報を取得（キャッシュ付き）
 * @param serviceName サービス名
 * @returns 認証情報オブジェクト、または null
 */
export async function getServiceCredentials(
  serviceName: string
): Promise<Record<string, unknown> | null> {
  // キャッシュチェック
  const cached = cache.get(serviceName);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug('キャッシュヒット', { serviceName });
    return cached.value;
  }

  // DBから取得
  try {
    const { data, error } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('credentials')
      .eq('service_name', serviceName)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // レコードが見つからない
        logger.debug('サービス認証情報が見つかりません', { serviceName });
        cache.set(serviceName, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
        return null;
      }
      logger.error('サービス認証情報取得エラー', { serviceName, error });
      return null;
    }

    const credentials = data?.credentials as Record<string, unknown> | null;

    // キャッシュに保存
    cache.set(serviceName, {
      value: credentials,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    logger.debug('サービス認証情報取得成功', { serviceName });
    return credentials;
  } catch (error) {
    logger.error('サービス認証情報取得例外', { serviceName, error });
    return null;
  }
}

/**
 * サービス認証情報から特定のキーを取得
 * @param serviceName サービス名
 * @param key 認証情報内のキー
 * @returns 値、または null
 */
export async function getServiceCredentialValue(
  serviceName: string,
  key: string
): Promise<string | null> {
  const credentials = await getServiceCredentials(serviceName);
  if (!credentials) return null;

  const value = credentials[key];
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * サービスURLを取得（よく使うパターン）
 * @param serviceName サービス名
 * @returns URL文字列、または null
 */
export async function getServiceUrl(serviceName: string): Promise<string | null> {
  return getServiceCredentialValue(serviceName, 'url');
}

/**
 * キャッシュをクリア
 * @param serviceName 特定のサービス名（省略時は全クリア）
 */
export function clearCredentialsCache(serviceName?: string): void {
  if (serviceName) {
    cache.delete(serviceName);
    logger.debug('キャッシュクリア', { serviceName });
  } else {
    cache.clear();
    logger.debug('キャッシュ全クリア');
  }
}

/**
 * キャッシュを無効化して再取得
 * @param serviceName サービス名
 */
export async function refreshServiceCredentials(
  serviceName: string
): Promise<Record<string, unknown> | null> {
  cache.delete(serviceName);
  return getServiceCredentials(serviceName);
}

// =============================================================
// 定義済みサービス名（補完用）
// =============================================================
export const SERVICE_NAMES = {
  /** ローカルFAX電話帳 GAS Web App */
  LOCAL_FAX_PHONEBOOK_GAS: 'local_fax_phonebook_gas',
  /** カイポケRPA */
  KAIPOKE_RPA: 'kaipoke_rpa',
} as const;
