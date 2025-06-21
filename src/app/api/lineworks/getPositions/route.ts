import { NextResponse } from 'next/server';
import { getPositionList } from '@/lib/lineworks/getPositions';
import { getAccessToken } from '@/lib/getAccessToken';

export async function GET() {
  try {
    const accessToken = await getAccessToken();
    const domainId = process.env.LINEWORKS_DOMAIN_ID!;
    if (!domainId) {
      return NextResponse.json({ error: 'LINEWORKS_DOMAIN_ID が未設定です' }, { status: 500 });
    }

    const positions = await getPositionList(accessToken, domainId);
    return NextResponse.json(positions);
  } catch (err) {
    console.error('[getPositions API] データ取得失敗:', err);
    return NextResponse.json({ error: 'Positions データ取得失敗' }, { status: 500 });
  }
}
