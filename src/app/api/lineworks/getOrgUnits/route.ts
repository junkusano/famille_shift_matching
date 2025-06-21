import { NextResponse } from 'next/server';
import { fetchOrgUnitList } from '@/lib/lineworks/getOrgUnits';

export async function GET() {
  try {
    const domainId = process.env.LINEWORKS_DOMAIN_ID!;
    if (!domainId) {
      return NextResponse.json({ error: 'LINEWORKS_DOMAIN_ID が未設定です' }, { status: 500 });
    }

    const orgUnits = await fetchOrgUnitList();
    console.log('[getOrgUnits API] レスポンスデータ:', orgUnits);
    return NextResponse.json(orgUnits);
  } catch (err) {
    console.error('[getOrgUnits API] データ取得失敗:', err);
    return NextResponse.json(
      { error: 'OrgUnit データ取得失敗' },
      { status: 500 }
    );
  }
}
