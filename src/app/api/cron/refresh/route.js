// src/app/api/cron/refresh/route.js
import { refreshLineworksAccessTokenToSupabase } from '@/cron/refreshToken';

export async function GET() {
  try {
    console.log('🔁 トークン更新処理開始');

    await refreshLineworksAccessTokenToSupabase();

    console.log('✅ トークン更新成功');
    return Response.json({ success: true, message: 'Token refreshed successfully' });
  } catch (error) {
    console.error('❌ トークン更新エラー:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error'
    }), { status: 500 });
  }
}
