// =============================================================
// src/lib/cm/plaud/cors.ts
// Plaud Chrome拡張用 CORSヘッダー
// =============================================================

/**
 * Plaud Chrome拡張向けの CORS ヘッダーを生成
 * @param methods 許可するHTTPメソッド（例: 'GET, OPTIONS'）
 */
export function cmPlaudCorsHeaders(methods: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-plaud-account',
  };
}
