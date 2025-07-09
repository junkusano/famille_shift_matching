import { NextResponse } from 'next/server';
import { getOrgList, OrgUnit } from '@/lib/lineworks/getOrgUnits'; // ←型import追加
import { getAccessToken } from '@/lib/getAccessToken';

// 型: parentOrgUnitName 付きの型を新しく
type OrgUnitWithParent = OrgUnit & { parentOrgUnitName?: string };

// 親組織名を追加で取得するヘルパー
function getParentOrgUnitName(orgUnitList: OrgUnit[], parentOrgUnitId?: string): string {
  if (!parentOrgUnitId) return '';
  const parentUnit = orgUnitList.find((unit) => unit.orgUnitId === parentOrgUnitId);
  return parentUnit?.orgUnitName || '';
}

export async function GET() {
  try {
    const accessToken = await getAccessToken();
    const domainId = process.env.LINEWORKS_DOMAIN_ID!;
    if (!domainId) {
      console.error('[getOrgUnits API] LINEWORKS_DOMAIN_ID が未設定です');
      return NextResponse.json({ error: 'LINEWORKS_DOMAIN_ID が未設定です' }, { status: 500 });
    }

    const orgUnits: OrgUnit[] = await getOrgList(accessToken, domainId);

    // 親組織名を付与して返す
    const orgUnitsWithParent: OrgUnitWithParent[] = orgUnits.map((unit) => ({
      ...unit,
      parentOrgUnitName: getParentOrgUnitName(orgUnits, unit.parentOrgUnitId),
    }));

    return NextResponse.json(orgUnitsWithParent);
  } catch (err) {
    console.error('[getOrgUnits API] データ取得失敗:', err);
    return NextResponse.json({ error: 'OrgUnits データ取得失敗' }, { status: 500 });
  }
}
