import axios from 'axios';


export type OrgUnit = {
  orgUnitId: string;
  orgUnitName: string;
  parentOrgUnitId?: string; // ← 必須！これを追加
  parentOrgUnitName?:string;
};


/**
 * LINE WORKS の組織一覧を取得する
 * @param accessToken アクセストークン
 * @param domainId ドメインID
 * @returns orgUnits の配列
 */
export async function getOrgList(accessToken: string, domainId: string) {
  try {
    const url = `https://www.worksapis.com/v1.0/orgunits?domainId=${domainId}`;
    console.log('Requesting OrgUnits URL:', url);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.orgUnits ?? [];
  } catch (err) {
    console.error('[getOrgList] データ取得失敗:', err);
    throw new Error('OrgUnits データ取得に失敗しました');
  }
}
