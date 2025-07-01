// src/app/api/cron/refresh/route.interval.js
import { refreshLineworksAccessTokenToSupabase } from '@/cron/refreshToken';

export const runtime = 'nodejs'; // Edgeでも可（必要に応じて変更）
export const revalidate = 0;

export const config = {
  schedule: '0 * * * *' // 毎時0分に実行（UTC時間基準）
};

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
