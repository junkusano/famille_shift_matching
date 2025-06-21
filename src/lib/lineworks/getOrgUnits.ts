import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type OrgUnit = {
  orgUnitId: string;
  orgUnitName: string;
};

type OrgUnitApiResponse = {
  orgUnits: {
    orgUnitId: string;
    orgUnitName: string;
  }[];
};

export async function fetchOrgUnitList(): Promise<OrgUnit[]> {
  const accessToken = await getAccessToken();
  const domainId = process.env.LINEWORKS_DOMAIN_ID;

  if (!accessToken || !domainId) {
    throw new Error('LINE WORKS の設定が不十分です');
  }

  const url = `https://www.worksapis.com/v1.0/orgunit/orgunits?domainId=${domainId}`;
  console.log('Requesting OrgUnits URL:', url);

  const response = await axios.get<OrgUnitApiResponse>(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const orgUnits = response.data.orgUnits ?? [];
  return orgUnits.map((org) => ({
    orgUnitId: org.orgUnitId,
    orgUnitName: org.orgUnitName
  }));
}
