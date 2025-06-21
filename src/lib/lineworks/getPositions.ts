import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type Position = {
  positionId: string;
  name: string;
};

export async function getPositionList(): Promise<Position[]> {
  const accessToken = await getAccessToken();

  const domainId = process.env.LINEWORKS_DOMAIN_ID;
  if (!domainId) {
    throw new Error('LINEWORKS_DOMAIN_ID が環境変数に設定されていません');
  }

  const response = await axios.get<{
    positions: {
      positionId: string;
      positionName: string;
    }[];
  }>(
    `https://www.worksapis.com/v1.0/positions?domainId=${domainId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.data || !response.data.positions) {
    console.warn('LINE WORKS 職位データが空です');
    return [];
  }

  return response.data.positions.map(pos => ({
    positionId: pos.positionId,
    name: pos.positionName
  }));
}
