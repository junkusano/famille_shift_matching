// =============================================================
// src/lib/cm/utils.ts
// CM用ユーティリティ関数
// =============================================================

/**
 * 住所を結合して表示用文字列を生成
 */
export function cmFormatAddress(client: {
  prefecture?: string | null;
  city?: string | null;
  town?: string | null;
}): string {
  return [client.prefecture, client.city, client.town].filter(Boolean).join('');
}

/**
 * 和暦の生年月日から年齢を計算
 * @param birthDateWareki 和暦形式の生年月日（例: "昭和7年4月24日"）
 * @returns 年齢（計算できない場合はnull）
 */
export function cmCalculateAge(birthDateWareki: string | null): number | null {
  if (!birthDateWareki) return null;

  const match = birthDateWareki.match(/(明治|大正|昭和|平成|令和)(\d+)年/);
  if (!match) return null;

  const era = match[1];
  const yearInEra = parseInt(match[2], 10);

  const eraStartYear: Record<string, number> = {
    '明治': 1868,
    '大正': 1912,
    '昭和': 1926,
    '平成': 1989,
    '令和': 2019,
  };

  const startYear = eraStartYear[era];
  if (!startYear) return null;

  const birthYear = startYear + yearInEra - 1;
  const currentYear = new Date().getFullYear();

  return currentYear - birthYear;
}

/**
 * 電話番号をフォーマット
 */
export function cmFormatPhone(phone: string | null): string {
  if (!phone) return '-';
  return phone;
}

/**
 * 日付をフォーマット（和暦 or ISO → 表示用）
 */
export function cmFormatDate(date: string | null): string {
  if (!date) return '-';
  return date;
}

/**
 * 要介護度に応じたTailwindクラスを返す
 * - 要介護 → オレンジ
 * - 要支援 → ブルー
 * - 事業対象者 → グリーン
 * - その他 → グレー
 */
export function cmGetCareLevelStyle(careLevel: string | null | undefined): string {
  if (!careLevel) return '';
  if (careLevel.includes('要介護')) return 'bg-orange-100 text-orange-700';
  if (careLevel.includes('要支援')) return 'bg-blue-100 text-blue-700';
  if (careLevel.includes('事業対象者')) return 'bg-green-100 text-green-700';
  return 'bg-slate-100 text-slate-600'; // その他
}