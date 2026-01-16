// =============================================================
// src/lib/cm/faxNumberUtils.ts
// FAX番号のユーティリティ関数
//
// 【機能】
// - FAX番号の正規化（ハイフン除去）
// - 比較用パターン生成（ハイフン混在対応）
// - 表示用フォーマット
// =============================================================

/**
 * FAX番号を正規化（数字のみに変換）
 * 
 * @example
 * normalizeFaxNumber('03-1234-5678') // => '0312345678'
 * normalizeFaxNumber('０３−１２３４−５６７８') // => '0312345678'（全角対応）
 */
export function normalizeFaxNumber(fax: string | null | undefined): string {
  if (!fax) return '';
  
  // 全角数字を半角に変換
  let normalized = fax.replace(/[０-９]/g, (s) => 
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  );
  
  // 数字以外を除去
  normalized = normalized.replace(/\D/g, '');
  
  // 国番号対応（81, 0081, +81）
  if (/^(81|0081|01081)/.test(normalized)) {
    const rest = normalized.replace(/^(81|0081|01081)/, '').replace(/^0+/, '');
    normalized = rest ? ('0' + rest) : '';
  }
  
  // 先頭が0でなければ補完
  if (normalized && normalized.charAt(0) !== '0') {
    normalized = '0' + normalized;
  }
  
  return normalized;
}

/**
 * FAX番号が一致するか比較（正規化して比較）
 * 
 * @example
 * isSameFaxNumber('03-1234-5678', '0312345678') // => true
 */
export function isSameFaxNumber(
  a: string | null | undefined, 
  b: string | null | undefined
): boolean {
  const normalizedA = normalizeFaxNumber(a);
  const normalizedB = normalizeFaxNumber(b);
  
  if (!normalizedA || !normalizedB) return false;
  
  return normalizedA === normalizedB;
}

/**
 * PostgreSQL ilike用の検索パターンを生成
 * 数字間にワイルドカードを挿入してハイフン混在に対応
 * 
 * @example
 * buildFaxSearchPattern('0312345678') 
 * // => '%0%3%1%2%3%4%5%6%7%8%'
 * 
 * これにより以下の全てにマッチ:
 * - 0312345678（ハイフンなし）
 * - 03-1234-5678（ハイフン付き）
 * - 03 1234 5678（スペース区切り）
 */
export function buildFaxSearchPattern(faxNumber: string | null | undefined): string | null {
  if (!faxNumber) return null;
  
  // まず正規化
  const digits = normalizeFaxNumber(faxNumber);
  
  // 最低8桁必要
  if (digits.length < 8) return null;
  
  // 各数字の間にワイルドカードを挿入
  return '%' + digits.split('').join('%') + '%';
}

/**
 * 検索用のFAX番号パターン配列を生成
 * 完全一致用とワイルドカード用の両方を返す
 * 
 * @returns { exact: string[], wildcard: string | null }
 */
export function buildFaxSearchPatterns(faxNumber: string | null | undefined): {
  exact: string[];
  wildcard: string | null;
} {
  if (!faxNumber) {
    return { exact: [], wildcard: null };
  }
  
  const digits = normalizeFaxNumber(faxNumber);
  
  if (digits.length < 8) {
    return { exact: [], wildcard: null };
  }
  
  // 完全一致パターン（よくあるハイフン形式）
  const exact: string[] = [
    digits, // ハイフンなし
    formatFaxWithHyphen(digits, [3, 2, 4]), // 03-12-3456
    formatFaxWithHyphen(digits, [3, 3, 4]), // 03-123-4567
    formatFaxWithHyphen(digits, [3, 4, 4]), // 03-1234-5678
    formatFaxWithHyphen(digits, [4, 2, 4]), // 0312-34-5678
    formatFaxWithHyphen(digits, [4, 3, 3]), // 0312-345-678
    formatFaxWithHyphen(digits, [5, 1, 4]), // 03123-4-5678
    formatFaxWithHyphen(digits, [2, 4, 4]), // 03-1234-5678
  ].filter((p): p is string => p !== null);
  
  // ワイルドカードパターン
  const wildcard = buildFaxSearchPattern(digits);
  
  return { exact: [...new Set(exact)], wildcard };
}

/**
 * FAX番号にハイフンを挿入
 * 
 * @param digits - 数字のみの文字列
 * @param parts - 各部分の桁数 [市外局番, 市内局番, 加入者番号]
 */
function formatFaxWithHyphen(digits: string, parts: number[]): string | null {
  if (!digits) return null;
  
  const totalLength = parts.reduce((a, b) => a + b, 0);
  if (digits.length !== totalLength) return null;
  
  let result = '';
  let pos = 0;
  
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) result += '-';
    result += digits.substring(pos, pos + parts[i]);
    pos += parts[i];
  }
  
  return result;
}

/**
 * FAX番号を表示用にフォーマット
 * 
 * @example
 * formatFaxNumber('0312345678') // => '03-1234-5678'
 */
export function formatFaxNumber(fax: string | null | undefined): string {
  if (!fax) return '';
  
  const digits = normalizeFaxNumber(fax);
  if (!digits) return fax; // 正規化できない場合は元の値を返す
  
  // 桁数に応じたフォーマット
  if (digits.length === 10) {
    // 03-1234-5678 形式（東京など）
    if (digits.startsWith('03') || digits.startsWith('06')) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    // 0568-12-3456 形式（地方）
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  }
  
  if (digits.length === 11) {
    // 090-1234-5678 形式（携帯）
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  
  // その他はそのまま返す
  return digits;
}