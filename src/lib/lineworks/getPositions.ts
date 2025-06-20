import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type Position = {
  positionId: string;
  name: string;
};

export async function getPositionList(): Promise<Position[]> {
  const accessToken = await getAccessToken();

  const response = await axios.get<{ positions: { positionId: string; name: string }[] }>(
    'https://www.worksapis.com/v1.0/positions',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.data || !response.data.positions) {
    console.warn('LINE WORKS ポジションデータが空です');
    return [];
  }

  return response.data.positions.map(position => ({
    positionId: position.positionId,
    name: position.name
  }));
}
