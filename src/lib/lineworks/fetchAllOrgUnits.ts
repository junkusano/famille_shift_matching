import axios from "axios";

export async function fetchAllOrgUnits(accessToken: string) {
  const url = "https://www.worksapis.com/v1.0/orgunits";

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        count: 100, // 必要に応じてカーソル対応へ拡張可
      },
    });

    return response.data?.orgUnits ?? [];
  } catch (error) {
    console.error("❌ orgUnits取得エラー:", error);
    throw error;
  }
}
