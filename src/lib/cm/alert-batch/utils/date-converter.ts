// src/lib/cm/alert-batch/utils/date-converter.ts
// 日付計算ユーティリティ（alert-batch専用）
//
// NOTE: cmParseJapaneseDate は @/lib/cm/utils.ts の実装を使用する

/**
 * Date を YYYY-MM-DD 形式の文字列に変換
 */
export function cmFormatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 2つの日付の差（日数）を計算
 * @param target 対象日
 * @param base 基準日（デフォルト: 今日）
 * @returns target - base の日数（負数 = 過去）
 */
export function cmDifferenceInDays(target: Date, base: Date = new Date()): number {
  // 時刻を除いた日付のみで計算
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const baseDate = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  const diffMs = targetDate.getTime() - baseDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 今日の日付を取得（時刻なし）
 */
export function cmGetToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}