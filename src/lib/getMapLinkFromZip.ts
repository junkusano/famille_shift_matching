// lib/getMapLinkFromZip.ts
export async function getMapLinkFromZip(zipcode: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipcode}`);
    const data = await res.json();

    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const { address2, address3 } = result;
      const address = `${address2}${address3}`; // 例：春日井市味美白山町

      // ★ HTML ではなく URL 文字列だけ返すように修正
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    }
  } catch (e) {
    console.error("地図リンク取得エラー:", e);
  }

  return undefined;
}
