// =============================================================
// src/lib/cm/supabase/cmSupabaseRetry.ts
// Supabase 操作のリトライユーティリティ
//
// Supabase（Cloudflare経由）が一時的なインフラ障害（502/503/504）を
// 返した場合に、指数バックオフでリトライする。
//
// 用途:
//   - RPA API Route 内の DB 操作（cmUpsertRecord 等）
//   - バッチ処理での Supabase 呼び出し
//
// 設計方針:
//   - リトライは「一時的なインフラ障害」のみ対象
//   - DB 制約エラー（23505 等）やバリデーションエラーはリトライしない
//   - OpenAI SDK の maxRetries と同様、呼び出し側が意識しなくてよい設計
// =============================================================

import {
  cmSanitizeSupabaseError,
} from "@/lib/cm/supabase/cmSupabaseErrorHelper";
import type { Logger } from "@/lib/common/logger";

// =============================================================
// 型定義
// =============================================================

/** リトライ設定 */
type CmSupabaseRetryOptions = {
  /** 最大リトライ回数（デフォルト: 2） */
  maxRetries?: number;
  /** 初回リトライまでの待機ミリ秒（デフォルト: 1000） */
  initialDelayMs?: number;
  /** ログに出力する操作名（例: "基本情報: SELECT"） */
  operationLabel: string;
  /** ロガー */
  logger: Logger;
};

/**
 * Supabase クエリの結果型
 * supabaseAdmin.from(...).select(...) 等の戻り値と同じ構造
 */
type CmSupabaseQueryResult<T> = {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
};

// =============================================================
// 定数
// =============================================================

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_INITIAL_DELAY_MS = 1000;

// =============================================================
// 内部関数
// =============================================================

/**
 * 指定ミリ秒間待機する
 */
function cmSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================
// 公開関数
// =============================================================

/**
 * Supabase クエリをリトライ付きで実行する
 *
 * 動作:
 *   1. queryFn を実行
 *   2. エラーが一時的なインフラ障害（HTML 502 等）の場合、指数バックオフでリトライ
 *   3. エラーが永続的（DB制約エラー等）の場合、即座に結果を返す
 *   4. リトライ上限に達した場合、最後の結果を返す
 *
 * エラーメッセージのサニタイズ:
 *   HTML エラーページがエラーメッセージに含まれている場合、
 *   result.error.message をサニタイズ済みのサマリーに置換して返す。
 *   呼び出し側は HTML 全文を意識する必要がない。
 *
 * @example
 * const result = await cmWithRetry(
 *   () => supabaseAdmin.from("cm_kaipoke_info").select("id").eq("kaipoke_cs_id", id).single(),
 *   { operationLabel: "基本情報: SELECT", logger }
 * );
 * // result.error?.message は常にサニタイズ済み
 *
 * @param queryFn - Supabase クエリを返す関数（PostgrestBuilder は PromiseLike のため Promise ではなく PromiseLike で受ける）
 * @param options - リトライ設定
 * @returns Supabase クエリの結果（エラーメッセージはサニタイズ済み）
 */
export async function cmWithRetry<T>(
  queryFn: () => PromiseLike<CmSupabaseQueryResult<T>>,
  options: CmSupabaseRetryOptions
): Promise<CmSupabaseQueryResult<T>> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    operationLabel,
    logger,
  } = options;

  let lastResult: CmSupabaseQueryResult<T> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await queryFn();
    lastResult = result;

    // 成功またはエラーなし → 即座に返す
    if (!result.error) {
      return result;
    }

    // エラーをサニタイズ
    const sanitized = cmSanitizeSupabaseError(result.error);

    // 永続的エラー → リトライしない
    if (sanitized.category === "permanent") {
      // サニタイズ済みメッセージに置換（HTML全文がログに出るのを防ぐ）
      return {
        data: result.data,
        error: { ...result.error, message: sanitized.summary },
      };
    }

    // 最終リトライ → これ以上リトライしない
    if (attempt >= maxRetries) {
      logger.error(`${operationLabel} リトライ上限到達`, undefined, {
        attempt: attempt + 1,
        maxRetries,
        error: sanitized.summary,
        httpStatus: sanitized.httpStatus,
      });
      return {
        data: result.data,
        error: { ...result.error, message: sanitized.summary },
      };
    }

    // リトライ可能 → 指数バックオフで待機してリトライ
    const delayMs = initialDelayMs * Math.pow(2, attempt);
    logger.warn(`${operationLabel} 一時的エラー、リトライ待機`, {
      attempt: attempt + 1,
      maxRetries,
      delayMs,
      error: sanitized.summary,
      httpStatus: sanitized.httpStatus,
    });

    await cmSleep(delayMs);
  }

  // ここに到達することはないが、TypeScript の型安全のため
  return lastResult!;
}

/**
 * Supabase エラーオブジェクトのメッセージをサニタイズする
 *
 * cmWithRetry を使わない箇所でも、ログ出力前にエラーメッセージを
 * サニタイズしたい場合に使用する。
 *
 * @example
 * if (selectError) {
 *   const msg = cmSanitizeErrorMessage(selectError);
 *   logger.error("検索エラー", undefined, { tableName, error: msg });
 * }
 *
 * @param error - Supabase の PostgrestError-like オブジェクト
 * @returns サニタイズ済みのエラーメッセージ（HTMLの場合はサマリー、通常はそのまま）
 */
export function cmSanitizeErrorMessage(error: {
  message: string;
  code?: string;
}): string {
  return cmSanitizeSupabaseError(error).summary;
}