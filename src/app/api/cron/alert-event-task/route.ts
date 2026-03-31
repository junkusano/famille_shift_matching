export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runEventTaskCheck } from '@/lib/alert_add/event_task_check';

type Body = {
    ok: boolean;
    event_task_check:
    | {
        ok: true;
        scannedTaskCount: number;
        targetTaskCount: number;
        alertsCreated: number;
        alertsUpdated: number;
    }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        event_task_check: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][event_task_check] start');
        const r = await runEventTaskCheck();
        console.info('[cron][event_task_check] end', r);

        result.event_task_check = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][event_task_check] error', msg);

        result.ok = false;
        result.event_task_check = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}