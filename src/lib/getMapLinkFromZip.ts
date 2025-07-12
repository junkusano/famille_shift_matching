// lib/getMapLinkFromZip.ts
export async function getMapLinkFromZip(zipcode: string): Promise<string | undefined> {
  const cleanZip = zipcode?.toString().replace(/[^0-9]/g, '').padStart(7, '0');

  if (!/^\d{7}$/.test(cleanZip)) {
    console.warn(`無効な郵便番号: "${zipcode}"`);
    return undefined;
  }

  console.log("🔍 getMapLinkFromZip called with:", cleanZip);

  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanZip}`);
    const data = await res.json();

    if (data?.results?.length > 0) {
      const result = data.results[0];
      const { address2, address3 } = result;
      const address = `${address2}${address3}`;
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    } else {
      console.warn(`住所データなし: "${cleanZip}"`, data?.message || '');
    }
  } catch (e) {
    console.error("地図リンク取得エラー:", e);
  }

  return undefined;
}
