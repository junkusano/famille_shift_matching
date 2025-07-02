import { refreshAccessToken } from '@/cron/refreshToken';

export async function GET() {
  try {
    console.log('🧪 手動トークン更新開始');
    const token = await refreshAccessToken();
    return Response.json({ success: true, token });
  } catch (err) {
    console.error('❌ 手動トークン更新失敗:', err);
    return new Response('Error', { status: 500 });
  }
}
