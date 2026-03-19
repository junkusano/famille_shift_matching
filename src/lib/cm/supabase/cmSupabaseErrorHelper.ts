// =============================================================
// src/lib/cm/supabase/cmSupabaseErrorHelper.ts
// Supabase エラーのサニタイズ・分類ユーティリティ
//
// Supabase（Cloudflare経由）が 502/503 等のインフラ障害時に
// HTMLエラーページを返すケースがある。
// このユーティリティはエラーメッセージからHTMLを検出し、
// ログに適したサマリーに変換する。
//
// 背景:
//   2026-03-18 に cm_kaipoke_info の SELECT 時に Supabase が
//   502 Bad Gateway を返し、Cloudflare の HTML ページ全文が
//   selectError.message に格納された。ログが数百行に膨れ、
//   またリトライなしでジョブが失敗扱いになった。
// =============================================================

// =============================================================
// 型定義
// =============================================================

/** エラーの分類 */
type CmSupabaseErrorCategory =
  | "transient"  // 一時的なインフラ障害（リトライ可能）
  | "permanent"; // DB エラー・バリデーションエラー等（リトライ不可）

/** サニタイズ済みエラー情報 */
type CmSanitizedError = {
  /** ログに記録すべきサマリーメッセージ */
  summary: string;
  /** エラーの分類 */
  category: CmSupabaseErrorCategory;
  /** 検出された HTTP ステータスコード（HTMLから抽出できた場合） */
  httpStatus: number | null;
};

// =============================================================
// 定数
// =============================================================

/**
 * HTML エラーページの検出パターン
 * Cloudflare / Supabase のエラーページに共通する特徴
 */
const HTML_ERROR_PATTERN = /<!DOCTYPE\s+html/i;

/**
 * Cloudflare エラーページからステータスコードを抽出するパターン
 * 例: "<title> | 502: Bad gateway</title>"
 */
const CLOUDFLARE_STATUS_PATTERN = /(\d{3}):\s*([^<]+)/;

/**
 * リトライ可能な HTTP ステータスコード
 * 502: Bad Gateway, 503: Service Unavailable, 504: Gateway Timeout
 */
const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

/**
 * Supabase エラーコードのうち一時的と判断できるもの
 * - PGRST301: connection error（DB接続障害）
 */
const TRANSIENT_SUPABASE_CODES = new Set(["PGRST301"]);

// =============================================================
// 公開関数
// =============================================================

/**
 * Supabase エラーメッセージがインフラ障害の HTML レスポンスかどうかを判定する
 *
 * @param message - Supabase エラーの message フィールド
 * @returns true の場合、HTML エラーページが含まれている
 */
export function cmIsHtmlErrorResponse(message: string): boolean {
  return HTML_ERROR_PATTERN.test(message);
}

/**
 * Supabase エラーをサニタイズし、ログに適したサマリーと分類を返す
 *
 * HTML エラーページが含まれている場合:
 *   - ステータスコードとメッセージを抽出してサマリーにする
 *   - HTML 全文はログに出力しない（数百行のノイズを防ぐ）
 *
 * 通常の Supabase エラーの場合:
 *   - message をそのまま返す
 *
 * @param error - Supabase の PostgrestError-like オブジェクト
 * @returns サニタイズ済みのエラー情報
 */
export function cmSanitizeSupabaseError(error: {
  message: string;
  code?: string;
}): CmSanitizedError {
  const { message, code } = error;

  // --- HTML エラーページの検出 ---
  if (cmIsHtmlErrorResponse(message)) {
    const statusMatch = message.match(CLOUDFLARE_STATUS_PATTERN);
    const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;
    const statusText = statusMatch ? statusMatch[2].trim() : "Unknown";

    const summary = httpStatus
      ? `Supabase infrastructure error: HTTP ${httpStatus} ${statusText} (Cloudflare)`
      : "Supabase infrastructure error: HTML error page returned (Cloudflare)";

    // HTML エラーページ自体が一時的な障害を示すので、不明でも transient 扱い
    const category: CmSupabaseErrorCategory =
      httpStatus && TRANSIENT_HTTP_STATUSES.has(httpStatus)
        ? "transient"
        : "transient";

    return { summary, category, httpStatus };
  }

  // --- 通常の Supabase エラー ---
  const isTransientCode = code ? TRANSIENT_SUPABASE_CODES.has(code) : false;
  const category: CmSupabaseErrorCategory = isTransientCode
    ? "transient"
    : "permanent";

  return { summary: message, category, httpStatus: null };
}

/**
 * エラーがリトライ可能な一時的障害かどうかを判定する
 *
 * 以下のケースで true を返す:
 *   - Cloudflare の HTML エラーページ（502, 503, 504）
 *   - Supabase の接続エラー（PGRST301）
 *
 * @param error - Supabase の PostgrestError-like オブジェクト
 * @returns true の場合、リトライ可能
 */
export function cmIsTransientSupabaseError(error: {
  message: string;
  code?: string;
}): boolean {
  return cmSanitizeSupabaseError(error).category === "transient";
}