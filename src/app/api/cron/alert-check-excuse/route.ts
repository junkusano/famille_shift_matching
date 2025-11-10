// /src/app/api/cron/alert-check-excuse/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '../../alert_add/_shared';

type CheckItem = { path: string; label?: string; enabled?: boolean };

type ChildOk = { ok: true; [k: string]: unknown };
type ChildNg = { ok: false; error?: string; [k: string]: unknown };
type ChildResp = ChildOk | ChildNg;

type ReportRow = { path: string; label: string; ok: boolean; status: number; body: ChildResp };

type ApiBody =
  | { ok: true; summary: { total: number; success: number; failure: number }; report: ReportRow[] }
  | { ok: false; error: string };

const CHECKS: CheckItem[] = [
  { path: '/api/alert_add/postal_code_check', label: '郵便番号未設定', enabled: true },
];

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';
    const only = (url.searchParams.get('only') ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const targets = CHECKS
      .filter(c => c.enabled !== false)
      .filter(c => {
        if (only.length === 0) return true;
        const lastSeg = c.path.split('/').filter(Boolean).pop() ?? '';
        return only.includes(lastSeg);
      });

    if (targets.length === 0) {
      const body: ApiBody = { ok: true, summary: { total: 0, success: 0, failure: 0 }, report: [] };
      return NextResponse.json(body, { status: 200 });
    }

    const settled = await Promise.allSettled(
      targets.map(async (t): Promise<ReportRow> => {
        const u = new URL(t.path, url.origin);
        if (token) u.searchParams.set('token', token);
        const res = await fetch(u.toString(), {
          method: 'GET',
          headers: { 'x-cron-token': token },
          keepalive: true,
        });
        let json: ChildResp;
        try {
          json = (await res.json()) as ChildResp;
        } catch {
          json = { ok: false, error: 'Invalid JSON' };
        }
        return {
          path: t.path,
          label: t.label ?? t.path,
          ok: res.ok,
          status: res.status,
          body: json,
        };
      }),
    );

    const report: ReportRow[] = settled.map((r): ReportRow => {
      if (r.status === 'fulfilled') return r.value;
      return { path: 'unknown', label: 'unknown', ok: false, status: 500, body: { ok: false, error: String(r.reason) } };
    });

    const summary = {
      total: report.length,
      success: report.filter(r => r.ok).length,
      failure: report.filter(r => !r.ok).length,
    };

    const body: ApiBody = { ok: true, summary, report };
    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const body: ApiBody = { ok: false, error: msg };
    return NextResponse.json(body, { status: 500 });
  }
}
