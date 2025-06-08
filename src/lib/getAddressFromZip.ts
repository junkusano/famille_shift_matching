// lib/getAddressFromZip.ts
export async function getAddressFromZip(zipcode: string): Promise<string | null> {
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipcode}`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      return result.address2 + result.address3; // 「春日井市味美白山町」
    }
  } catch (e) {
    console.error("住所取得エラー:", e);
  }
  return null;
}
