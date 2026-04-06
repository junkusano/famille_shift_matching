export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runShiftRecordUnfinishedCheck } from '@/lib/alert_add/shift_record_unfinished_check';

type Body = {
    ok: boolean;
    shift_record_unfinished:
    | {
        ok: true;
        scanned: number;
        created: number;
    }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        shift_record_unfinished: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][shift_record_unfinished_check] start');
        const r = await runShiftRecordUnfinishedCheck();
        console.info('[cron][shift_record_unfinished_check] end', r);

        result.shift_record_unfinished = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][shift_record_unfinished_check] error', msg);

        result.ok = false;
        result.shift_record_unfinished = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}