import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type OrgUnit = {
  orgUnitId: string;
  name: string;
};

export async function getOrgList(): Promise<OrgUnit[]> {
  const accessToken = await getAccessToken();

  const domainId = process.env.LINEWORKS_DOMAIN_ID;
  if (!domainId) {
    throw new Error('LINEWORKS_DOMAIN_ID が環境変数に設定されていません');
  }

  const response = await axios.get<{
    orgUnits: {
      orgUnitId: string;
      orgUnitName: string;
    }[];
  }>(
    `https://www.worksapis.com/v1.0/orgunits?domainId=${domainId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.data || !response.data.orgUnits) {
    console.warn('LINE WORKS 組織データが空です');
    return [];
  }

  return response.data.orgUnits.map(org => ({
    orgUnitId: org.orgUnitId,
    name: org.orgUnitName
  }));
}
