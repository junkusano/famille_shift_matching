import { NextResponse } from 'next/server';
import { fetchLevelList } from '@/lib/lineworks/getLevels';
//import { getAccessToken } from '@/lib/getAccessToken';

export async function GET() {
  try {
    //const accessToken = await getAccessToken();
    const domainId = process.env.LINEWORKS_DOMAIN_ID!;
    if (!domainId) {
      return NextResponse.json({ error: 'LINEWORKS_DOMAIN_ID が未設定です' }, { status: 500 });
    }

    const levels = await fetchLevelList();
    return NextResponse.json(levels);
  } catch (err) {
    console.error('[getLevels API] データ取得失敗:', err);
    return NextResponse.json({ error: 'Levels データ取得失敗' }, { status: 500 });
  }
}
