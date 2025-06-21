import { NextResponse } from 'next/server';
import { getPositionList } from '@/lib/lineworks/getPositions';

export async function GET() {
  try {
    const tokenRes = await fetch(`${process.env.BASE_URL}/api/getAccessToken`);
    const tokenJson = await tokenRes.json();

    if (!tokenJson.accessToken) {
      return NextResponse.json({ error: 'AccessTokenが必要です' }, { status: 500 });
    }

    const domainId = process.env.LINEWORKS_DOMAIN_ID!;
    const positions = await getPositionList(tokenJson.accessToken, domainId);

    return NextResponse.json(positions);
  } catch (err) {
    console.error('[getPositions API] エラー:', err);
    return NextResponse.json({ error: 'Positions データ取得失敗' }, { status: 500 });
  }
}
