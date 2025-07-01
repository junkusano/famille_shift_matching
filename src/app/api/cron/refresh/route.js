// src/app/api/cron/refresh/route.js
import { refreshLineworksAccessTokenToSupabase } from '@/cron/refreshToken';

export async function GET() {
  try {
    console.log('🧪 手動トークン更新開始');
    await refreshLineworksAccessTokenToSupabase();
    return Response.json({ success: true });
  } catch (err) {
    console.error('❌ 手動トークン更新失敗:', err);
    return new Response('Error', { status: 500 });
  }
}
