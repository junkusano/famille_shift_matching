// src/app/api/cron/refresh/route.interval.ts
import { refreshAccessToken } from '@/cron/refreshToken';


export const runtime = 'nodejs';
export const revalidate = 0;

export const config = {
  schedule: '*/1 * * * *'
};

export async function GET(): Promise<Response> {
  try {
    await refreshAccessToken();

    return new Response(JSON.stringify({
      success: true,
      message: 'Token refreshed successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const err = error as Error;
    return new Response(JSON.stringify({
      success: false,
      error: err.message ?? 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
