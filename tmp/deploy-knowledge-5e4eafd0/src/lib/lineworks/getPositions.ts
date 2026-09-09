import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type Position = {
  positionId: string;
  positionName: string;
};

/**
 * LINE WORKS の役職一覧の API レスポンス型
 */
type PositionApiResponse = {
  positions: {
    positionId: string;
    positionName: string;
  }[];
};

/**
 * LINE WORKS の役職一覧を取得して整形した配列を返す
 */
export async function fetchPositionList(): Promise<Position[]> {
  const accessToken = await getAccessToken();
  const domainId = process.env.LINEWORKS_DOMAIN_ID;

  if (!accessToken || !domainId) {
    throw new Error('LINE WORKS の設定が不十分です');
  }

  const url = `https://www.worksapis.com/v1.0/directory/positions?domainId=${domainId}`;
  console.log('Requesting Positions URL:', url);

  const response = await axios.get<PositionApiResponse>(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const positions = response.data.positions ?? [];
  return positions.map((p) => ({
    positionId: p.positionId,
    positionName: p.positionName
  }));
}
