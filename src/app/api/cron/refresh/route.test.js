// src/app/api/cron/refresh/route.test.js
import { refreshLineworksAccessTokenToSupabase } from '@/cron/refreshToken';

export async function GET() {
  try {
    await refreshLineworksAccessTokenToSupabase();
    return Response.json({ success: true });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500 }
    );
  }
}
