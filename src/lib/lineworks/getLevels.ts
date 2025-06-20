import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type Level = {
  levelId: string;
  name: string;
};

export async function getLevelList(): Promise<Level[]> {
  const accessToken = await getAccessToken();

  const response = await axios.get<{ levels: { levelId: string; name: string }[] }>(
    'https://www.worksapis.com/v1.0/levels',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.data || !response.data.levels) {
    console.warn('LINE WORKS レベルデータが空です');
    return [];
  }

  return response.data.levels.map(level => ({
    levelId: level.levelId,
    name: level.name
  }));
}
