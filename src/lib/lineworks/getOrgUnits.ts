import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type OrgUnit = {
  orgUnitId: string;
  name: string;
};

export async function getOrgList(): Promise<OrgUnit[]> {
  const accessToken = await getAccessToken();

  const response = await axios.get<{ orgUnits: { orgUnitId: string; name: string }[] }>(
    'https://www.worksapis.com/v1.0/orgunits',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.data || !response.data.orgUnits) {
    console.warn('LINE WORKS 組織データが空です');
    return [];
  }

  return response.data.orgUnits.map(org => ({
    orgUnitId: org.orgUnitId,
    name: org.name
  }));
}
