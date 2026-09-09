import axios from "axios";
import { getAccessToken } from "@/lib/getAccessToken";

export async function fetchAllOrgUnits() {
  const url = "https://www.worksapis.com/v1.0/orgunits";
  const token = await getAccessToken();

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
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
