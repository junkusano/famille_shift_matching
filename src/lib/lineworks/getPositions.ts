import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export async function getPositionList(): Promise<{ positionId: string; name: string }[]> {
  try {
    const accessToken = await getAccessToken();

    const response = await axios.get('https://www.worksapis.com/v1.0/positions', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = response.data;

    if (!data || !Array.isArray(data.positions)) {
      console.warn('LINE WORKS 役職データが不正です:', data);
      return [];
    }

    return data.positions.map((pos: any) => ({
      positionId: pos.positionId,
      name: pos.name
    }));
  } catch (err) {
    console.error('LINE WORKS 役職一覧取得エラー:', err);
    return [];
  }
}
