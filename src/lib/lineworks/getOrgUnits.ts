import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export async function getOrgList(): Promise<{ orgUnitId: string; name: string }[]> {
  try {
    const accessToken = await getAccessToken();

    const response = await axios.get('https://www.worksapis.com/v1.0/orgunits', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = response.data;

    if (!data || !Array.isArray(data.orgUnits)) {
      console.warn('LINE WORKS 組織データが不正です:', data);
      return [];
    }

    return data.orgUnits.map((unit: any) => ({
      orgUnitId: unit.orgUnitId,
      name: unit.name
    }));
  } catch (err) {
    console.error('LINE WORKS 組織一覧取得エラー:', err);
    return [];
  }
}
