import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type Level = {
  levelId: string;
  levelName: string;
};

/**
 * LINE WORKS の職級一覧を取得して整形した配列を返す
 */
export async function fetchLevelList(): Promise<Level[]> {
  const accessToken = await getAccessToken();
  const domainId = process.env.LINEWORKS_DOMAIN_ID;

  if (!accessToken || !domainId) {
    throw new Error('LINE WORKS の設定が不十分です');
  }

  const url = `https://www.worksapis.com/v1.0/directory/levels?domainId=${domainId}`;
  console.log('Requesting Levels URL:', url);

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const levels = response.data.levels ?? [];
  return levels.map((l: any) => ({
    levelId: l.levelId,
    levelName: l.levelName
  }));
}
