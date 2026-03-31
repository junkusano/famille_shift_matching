export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runResignerShiftCheck } from '@/lib/alert_add/resigner_shift_check';

type Body = {
    ok: boolean;
    resigner_shift:
    | { ok: true; scanned: number; created: number }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        resigner_shift: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][resigner_shift_check] start');
        const r = await runResignerShiftCheck();
        console.info('[cron][resigner_shift_check] end', r);

        result.resigner_shift = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][resigner_shift_check] error', msg);

        result.ok = false;
        result.resigner_shift = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}