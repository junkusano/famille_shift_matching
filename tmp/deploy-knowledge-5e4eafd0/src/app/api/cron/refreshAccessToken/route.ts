//api/cron/refreshAccessToken
import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { refreshAccessToken } from '@/lib/lineworks/refreshAccessToken'; // ← 修正ここ

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
    await refreshAccessToken();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ 手動トークン更新失敗:', err);
    const unauthorized = err instanceof Error && err.message === 'Unauthorized';
    return NextResponse.json(
      { error: unauthorized ? 'unauthorized_cron' : 'アクセストークン更新失敗' },
      { status: unauthorized ? 401 : 500 }
    );
  }
}
