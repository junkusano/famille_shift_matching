import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type OrgUnit = {
  orgUnitId: string;
  orgUnitName: string;
};

/**
 * LINE WORKS の組織一覧 API のレスポンス型
 */
type OrgUnitApiResponse = {
  orgUnits: {
    orgUnitId: string;
    orgUnitName: string;
  }[];
};

/**
 * LINE WORKS の組織一覧を取得し整形した配列を返す
 */
export async function fetchOrgUnitList(): Promise<OrgUnit[]> {
  const accessToken = await getAccessToken();
  const domainId = process.env.LINEWORKS_DOMAIN_ID;

  if (!accessToken || !domainId) {
    throw new Error('LINE WORKS の設定が不十分です');
  }

  const url = `https://www.worksapis.com/v1.0/directory/orgunits?domainId=${domainId}`;
  console.log('Requesting OrgUnits URL:', url);

  const response = await axios.get<OrgUnitApiResponse>(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const orgUnits = response.data.orgUnits ?? [];
  return orgUnits.map(u => ({
    orgUnitId: u.orgUnitId,
    orgUnitName: u.orgUnitName
  }));
}
