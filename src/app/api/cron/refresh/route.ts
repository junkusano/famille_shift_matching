import { NextResponse } from 'next/server';
import { refreshAccessToken } from '@/cron/refreshToken';

export async function GET() {
  try {
    const accessToken = await refreshAccessToken();
    console.log('[✅アクセストークン]', accessToken);
    return NextResponse.json({ access_token: accessToken });
  } catch (err) {
    console.error('❌ 手動トークン更新失敗:', err);
    return NextResponse.json(
      { error: 'アクセストークン更新失敗', detail: String(err) },
      { status: 500 }
    );
  }
}