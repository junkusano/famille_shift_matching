export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runPostalCodeCheck } from '@/lib/alert_add/postal_code_check';

type Body = {
    ok: boolean;
    postal_code:
    | { ok: true; scanned: number; created: number }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        postal_code: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][postal_code_check] start');
        const r = await runPostalCodeCheck();
        console.info('[cron][postal_code_check] end', r);

        result.postal_code = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][postal_code_check] error', msg);

        result.ok = false;
        result.postal_code = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}