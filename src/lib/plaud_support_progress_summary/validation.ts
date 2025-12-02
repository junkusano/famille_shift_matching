// =============================================================
// src/lib/plaud_support_progress_summary/validation.ts
// Plaud支援経過要約検証ユーティリティ
// =============================================================
//
// 【概要】
// OpenAI APIから返却された要約の品質を検証する
// - 文字数チェック
// - 前置きパターンチェック
// - 禁止文字チェック
//
// =============================================================

// =============================================================
// 型定義
// =============================================================

/**
 * 検証結果の型
 */
export type ValidationResult = {
  valid: boolean;           // 検証OK: true
  error?: string;           // エラーメッセージ
  errorType?: SummaryValidationErrorType;  // エラー種別
};

/**
 * 要約検証エラー種別
 */
export type SummaryValidationErrorType =
  | 'EMPTY_SUMMARY'           // 要約が空
  | 'TOO_SHORT'               // 文字数が短すぎる（20文字未満）
  | 'HAS_PREAMBLE'            // 前置きパターンが含まれる
  | 'HAS_FORBIDDEN_CHARS';    // 禁止文字が含まれる

// =============================================================
// 定数
// =============================================================

/**
 * 最小文字数
 */
const MIN_SUMMARY_LENGTH = 20;

/**
 * 前置きパターン（これらで始まる場合はNG）
 */
const PREAMBLE_PATTERNS = [
  /^以下/,
  /^Here/i,
  /^Below/i,
  /^The\s/i,
  /^This\s/i,
  /^I\s/i,
  /^Summary/i,
  /^要約/,
];

/**
 * 禁止文字パターン（Unicode範囲）
 * - キリル文字: \u0400-\u04FF
 * - デーヴァナーガリー文字: \u0900-\u097F
 * - ハングル文字: \uAC00-\uD7AF, \u1100-\u11FF
 * - アラビア文字: \u0600-\u06FF
 * - タイ文字: \u0E00-\u0E7F
 */
const FORBIDDEN_CHAR_PATTERN = /[\u0400-\u04FF\u0900-\u097F\uAC00-\uD7AF\u1100-\u11FF\u0600-\u06FF\u0E00-\u0E7F]/;

// =============================================================
// メイン関数
// =============================================================

/**
 * 要約内容を検証する
 * 
 * @param summary - 検証対象の要約テキスト
 * @returns 検証結果
 * 
 * @example
 * const result = validateSummary(summary);
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 */
export function validateSummary(summary: string | null | undefined): ValidationResult {
  // ─────────────────────────────────────────────────────────────
  // 1. 空チェック
  // ─────────────────────────────────────────────────────────────
  if (summary === null || summary === undefined || summary.trim() === '') {
    return {
      valid: false,
      error: '要約が空です',
      errorType: 'EMPTY_SUMMARY',
    };
  }

  const trimmedSummary = summary.trim();

  // ─────────────────────────────────────────────────────────────
  // 2. 文字数チェック（20文字未満はNG）
  // ─────────────────────────────────────────────────────────────
  if (trimmedSummary.length < MIN_SUMMARY_LENGTH) {
    return {
      valid: false,
      error: `要約が短すぎます（${trimmedSummary.length}文字、最低${MIN_SUMMARY_LENGTH}文字必要）`,
      errorType: 'TOO_SHORT',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3. 前置きパターンチェック
  // ─────────────────────────────────────────────────────────────
  for (const pattern of PREAMBLE_PATTERNS) {
    if (pattern.test(trimmedSummary)) {
      return {
        valid: false,
        error: `要約に前置きパターンが含まれています: "${trimmedSummary.substring(0, 30)}..."`,
        errorType: 'HAS_PREAMBLE',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. 禁止文字チェック
  // ─────────────────────────────────────────────────────────────
  const forbiddenMatch = trimmedSummary.match(FORBIDDEN_CHAR_PATTERN);
  if (forbiddenMatch) {
    return {
      valid: false,
      error: `要約に禁止文字が含まれています: "${forbiddenMatch[0]}"`,
      errorType: 'HAS_FORBIDDEN_CHARS',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 5. 検証OK
  // ─────────────────────────────────────────────────────────────
  return { valid: true };
}

/**
 * リトライ時の追加プロンプトを取得する
 * 
 * @param retryCount - 現在のリトライ回数（0始まり）
 * @param errorType - 前回のエラー種別
 * @returns 追加プロンプト（なければ空文字）
 * 
 * @example
 * const additionalPrompt = getRetryPromptAddition(1, 'HAS_FORBIDDEN_CHARS');
 * // "【追加指示】必ず日本語で回答してください。"
 */
export function getRetryPromptAddition(
  retryCount: number,
  errorType?: SummaryValidationErrorType
): string {
  // 検証エラー以外（OpenAI APIエラー等）はプロンプト強化なし
  if (!errorType) {
    return '';
  }

  // リトライ回数に応じた追加指示
  if (retryCount === 1) {
    return '\n\n【追加指示】必ず日本語で回答してください。';
  }
  
  if (retryCount >= 2) {
    return '\n\n【追加指示】日本語のみで回答。ロシア語・韓国語・ヒンディー語等の外国語は使用禁止。';
  }

  return '';
}

/**
 * エラー種別がリトライ可能かどうかを判定する
 * 
 * @param errorType - エラー種別
 * @returns リトライ可能: true
 */
export function isRetryableValidationError(errorType: SummaryValidationErrorType): boolean {
  // 全ての検証エラーはプロンプト強化でリトライ可能
  return true;
}
