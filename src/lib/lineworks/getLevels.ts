import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type Level = {
  levelId: string;
  name: string;
};

export async function getLevelList(): Promise<Level[]> {
  const accessToken = await getAccessToken();

  const domainId = process.env.LINEWORKS_DOMAIN_ID;
  if (!domainId) {
    throw new Error('LINEWORKS_DOMAIN_ID が環境変数に設定されていません');
  }

  const response = await axios.get<{
    levels: {
      levelId: string;
      levelName: string;
    }[];
  }>(
    `https://www.worksapis.com/v1.0/levels?domainId=${domainId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.data || !response.data.levels) {
    console.warn('LINE WORKS レベルデータが空です');
    return [];
  }

  return response.data.levels.map(level => ({
    levelId: level.levelId,
    name: level.levelName
  }));
}
