export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runShiftCertCheck } from '@/lib/alert_add/shift_cert_check';

type Body = {
    ok: boolean;
    shift_cert_check:
    | {
        ok: true;
        scanned: number;
        alertsCreated: number;
        alertsUpdated: number;
    }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        shift_cert_check: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][shift_cert_check] start');
        const r = await runShiftCertCheck();
        console.info('[cron][shift_cert_check] end', r);

        result.shift_cert_check = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][shift_cert_check] error', msg);

        result.ok = false;
        result.shift_cert_check = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}