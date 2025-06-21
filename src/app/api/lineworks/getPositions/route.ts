import { NextResponse } from 'next/server';
import { fetchPositionList } from '@/lib/lineworks/getPositions';

export async function GET() {
  try {
    const domainId = process.env.LINEWORKS_DOMAIN_ID!;
    if (!domainId) {
      return NextResponse.json({ error: 'LINEWORKS_DOMAIN_ID が未設定です' }, { status: 500 });
    }

    const positions = await fetchPositionList();
    console.log('[getPositions API] レスポンスデータ:', positions);
    return NextResponse.json(positions);
  } catch (err) {
    console.error('[getPositions API] データ取得失敗:', err);
    return NextResponse.json({ error: 'Positions データ取得失敗' }, { status: 500 });
  }
}
