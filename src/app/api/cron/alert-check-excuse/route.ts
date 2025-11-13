// /src/app/api/cron/alert-check-excuse/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '../../alert_add/_shared';
import { runPostalCodeCheck } from '@/lib/alert_add/postal_code_check';

type ApiOk = {
  ok: true;
  scanned: number;
  created: number;
};

type ApiErr = {
  ok: false;
  error: string;
};

export async function GET(req: NextRequest) {
  try {
    // Cron 用の認証（CRON_SECRET 等）はここでだけチェック
    assertCronAuth(req);

    const { scanned, created } = await runPostalCodeCheck();

    const body: ApiOk = {
      ok: true,
      scanned,
      created,
    };
    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron][alert-check-excuse] fatal', msg);

    const body: ApiErr = { ok: false, error: msg };
    return NextResponse.json(body, { status: 500 });
  }
}
