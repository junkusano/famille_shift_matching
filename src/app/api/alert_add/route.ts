// /src/app/api/alert_add/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth, getIncomingCronToken, getServerCronSecret } from './_shared';

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const baseUrl = new URL(req.url);
    const incoming = getIncomingCronToken(req);
    const token = incoming.token ?? getServerCronSecret() ?? '';
    const debug = baseUrl.searchParams.get('debug') === '1';

    const urls = [
      '/api/alert_add/postal_code_check',
      '/api/alert_add/resigner_shift_check',
      '/api/alert_add/shift_record_unfinish_check',
    ];

    const results: { path: string; ok: boolean; status: number; body: unknown }[] = [];

    for (const path of urls) {
      const u = new URL(path, baseUrl.origin);
      if (debug) u.searchParams.set('debug', '1');
      if (token) u.searchParams.set('token', token); // ★ クエリにも

      const headers: Record<string,string> = {};
      if (token) {
        headers['authorization'] = `Bearer ${token}`;
        headers['x-cron-token']  = token;
      }

      const res = await fetch(u.toString(), {
        method: 'GET',
        headers,
        cache: 'no-store',
        next: { revalidate: 0 },
      });

      const text = await res.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { json = { ok: false, error: 'Invalid JSON', raw: text }; }

      results.push({ path, ok: res.ok, status: res.status, body: json });
    }

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
}
