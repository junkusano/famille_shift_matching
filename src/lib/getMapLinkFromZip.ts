// lib/getMapLinkFromZip.ts
export async function getMapLinkFromZip(zipcode: string): Promise<string> {
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipcode}`);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const { address2, address3 } = result;
      const address = `${address2}${address3}`; // 例：春日井市味美白山町

      // Googleマップリンク付きのHTML文字列を返す
      const googleMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
      return `<a href="${googleMapUrl}" class="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">${address}</a>`;
    }
  } catch (e) {
    console.error("地図リンク取得エラー:", e);
  }

  return '―';
}
