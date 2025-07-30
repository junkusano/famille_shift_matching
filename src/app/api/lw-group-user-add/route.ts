// app/api/lw-group-user-add/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/getAccessToken';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { groupId, userId } = await req.json();

    if (!groupId || !userId) {
      return NextResponse.json({ error: 'groupIdとuserIdが必要です' }, { status: 400 });
    }

    const accessToken = await getAccessToken();

    const res = await fetch(`https://www.worksapis.com/v1.0/groups/${encodeURIComponent(groupId)}/members`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: userId,
        type: 'USER',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('❌ グループ追加失敗:', text);
      return NextResponse.json({ error: text }, { status: res.status });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    console.error('❌ サーバーエラー:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
