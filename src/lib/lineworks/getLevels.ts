import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export async function getLevelList(): Promise<{ levelId: string; name: string }[]> {
  try {
    const accessToken = await getAccessToken();

    const response = await axios.get('https://www.worksapis.com/v1.0/levels', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = response.data;

    if (!data || !Array.isArray(data.levels)) {
      console.warn('LINE WORKS 職級データが不正です:', data);
      return [];
    }

    return data.levels.map((level: any) => ({
      levelId: level.levelId,
      name: level.name
    }));
  } catch (err) {
    console.error('LINE WORKS 職級一覧取得エラー:', err);
    return [];
  }
}
