// /src/app/api/alert_add/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from './_shared';

type ChildOk = { ok: true; [k: string]: unknown };
type ChildNg = { ok: false; error?: string; [k: string]: unknown };
type ChildResp = ChildOk | ChildNg;

type Aggregated = {
  path: string;
  ok: boolean;
  status: number;
  body: ChildResp;
};

type ApiBody = { ok: true; results: Aggregated[] } | { ok: false; error: string };

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const baseUrl = new URL(req.url);
    const token = baseUrl.searchParams.get('token') ?? '';

    const urls = [
      '/api/alert_add/postal_code_check',
      '/api/alert_add/resigner_shift_check',
      '/api/alert_add/shift_record_unfinish_check',
      // '/api/alert_add/xxx_check',
    ];

    const results: Aggregated[] = [];
    for (const path of urls) {
      const u = new URL(path, baseUrl.origin); // ← タイポ修正（pat\nh → path）
      if (token) u.searchParams.set('token', token);

      const res = await fetch(u.toString(), { method: 'GET', headers: { 'x-cron-token': token } });
      let json: ChildResp;
      try {
        json = (await res.json()) as ChildResp;
      } catch {
        json = { ok: false, error: 'Invalid JSON' };
      }

      results.push({ path, ok: res.ok, status: res.status, body: json });
    }

    const body: ApiBody = { ok: true, results };
    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const body: ApiBody = { ok: false, error: msg };
    return NextResponse.json(body, { status: 401 });
  }
}
