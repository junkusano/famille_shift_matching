import { NextResponse } from 'next/server';
import { getOrgList } from '@/lib/lineworks/getOrgUnits';
import { getAccessToken } from '@/lib/getAccessToken';

export async function GET() {
  try {
    const accessToken = await getAccessToken();
    const domainId = process.env.LINEWORKS_DOMAIN_ID!;
    if (!domainId) {
      console.error('[getOrgUnits API] LINEWORKS_DOMAIN_ID が未設定です');
      return NextResponse.json({ error: 'LINEWORKS_DOMAIN_ID が未設定です' }, { status: 500 });
    }

    const orgUnits = await getOrgList(accessToken, domainId);
    return NextResponse.json(orgUnits);
  } catch (err) {
    console.error('[getOrgUnits API] データ取得失敗:', err);
    return NextResponse.json({ error: 'OrgUnits データ取得失敗' }, { status: 500 });
  }
}
