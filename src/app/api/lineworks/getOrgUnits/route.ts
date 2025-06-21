import { NextResponse } from 'next/server';
import { fetchOrgUnitList } from '@/lib/lineworks/getOrgUnits';

export async function GET() {
  try {
    const orgUnits = await fetchOrgUnitList();
    console.log('[getOrgUnits API] レスポンスデータ:', orgUnits);
    return NextResponse.json(orgUnits);
  } catch (err) {
    console.error('[getOrgUnits API] データ取得失敗:', err);
    return NextResponse.json({ error: 'OrgUnits データ取得失敗' }, { status: 500 });
  }
}
