// =============================================================
// src/lib/cm/supabase/sanitizeFilterValue.ts
// PostgREST フィルター値のサニタイズユーティリティ
//
// Supabase JS クライアントの .or() に文字列テンプレートで値を埋め込む際、
// PostgREST フィルター構文の特殊文字を除去してインジェクションを防ぐ。
//
// 背景:
//   Supabase クライアントはサーバーサイドでパラメータ化するため
//   SQL インジェクションには直結しないが、PostgREST フィルター構文
//   自体に対するインジェクション（ . や , を含む入力で構文が壊れる）
//   のリスクがある。
//
// 使い方:
//   import { cmSanitizeForOrFilter, cmSanitizeForLikeValue } from "@/lib/cm/supabase/sanitizeFilterValue";
//
//   // .or() 文字列テンプレートに埋め込む場合
//   const safe = cmSanitizeForOrFilter(userInput);
//   query = query.or(`name.ilike.%${safe}%,kana.ilike.%${safe}%`);
//
//   // .ilike() メソッドに渡す場合
//   const safe = cmSanitizeForLikeValue(userInput);
//   query = query.ilike("office_name", `%${safe}%`);
// =============================================================

/**
 * PostgREST フィルター構文で特殊な意味を持つ文字
 *
 * - `.` : フィールド名・演算子・値の区切り（例: name.ilike.value）
 * - `,` : OR 条件の区切り（例: name.eq.A,name.eq.B）
 * - `(` `)` : 条件のグルーピング
 */
const POSTGREST_METACHAR_PATTERN = /[.,()]/g;

/**
 * SQL LIKE パターンのワイルドカード文字
 *
 * - `%` : 任意の0文字以上
 * - `_` : 任意の1文字
 * - `\` : エスケープ文字
 *
 * ※ `%` と `_` はコード側で意図的に付与する（例: `%${value}%`）。
 *   ユーザー入力に含まれるものは除去し、意図しないワイルドカード展開を防ぐ。
 */
const LIKE_WILDCARD_PATTERN = /[%_\\]/g;

/**
 * .or() 文字列テンプレートに埋め込む値をサニタイズする
 *
 * PostgREST フィルター構文の特殊文字と SQL LIKE ワイルドカードの
 * 両方を除去する。.or() 内で ilike と併用する場合に使う。
 *
 * @example
 * ```typescript
 * const safe = cmSanitizeForOrFilter(search);
 * query = query.or(`name.ilike.%${safe}%,kana.ilike.%${safe}%`);
 * ```
 */
export function cmSanitizeForOrFilter(value: string): string {
  return value
    .replace(LIKE_WILDCARD_PATTERN, "")
    .replace(POSTGREST_METACHAR_PATTERN, "");
}

/**
 * .ilike() メソッドに渡す値をサニタイズする
 *
 * .ilike() メソッドは Supabase クライアントが個別にクエリパラメータを
 * 構築するため PostgREST フィルター構文インジェクションのリスクは低いが、
 * LIKE ワイルドカード文字はユーザー入力から除去する。
 *
 * @example
 * ```typescript
 * const safe = cmSanitizeForLikeValue(officeName);
 * query = query.ilike("office_name", `%${safe}%`);
 * ```
 */
export function cmSanitizeForLikeValue(value: string): string {
  return value.replace(LIKE_WILDCARD_PATTERN, "");
}