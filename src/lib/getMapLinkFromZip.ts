// lib/getMapLinkFromZip.ts

/**
 * 郵便番号からGoogleマップ検索リンクを生成する
 * - zipcloudなどの外部APIには依存しない
 * - 郵便番号が7桁でない場合は undefined を返す
 * - 安全性とパフォーマンスを重視した軽量処理
 */
export async function getMapLinkFromZip(zipcode: string): Promise<string | undefined> {
  // ハイフンや空白、全角などを除去し、7桁に整形
  const cleanZip = zipcode?.replace(/[^0-9]/g, '').padStart(7, '0');

  // 無効な郵便番号は除外
  if (!/^\d{7}$/.test(cleanZip)) {
    console.warn(`getMapLinkFromZip: 無効な郵便番号 "${zipcode}"`);
    return undefined;
  }

  // Googleマップの検索クエリ形式で返す（例: https://www.google.com/maps/search/?api=1&query=4860969）
  return `https://www.google.com/maps/search/?api=1&query=${cleanZip}`;
}
