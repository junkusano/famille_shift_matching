export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runLwAiChanBotCheck } from '@/lib/alert_add/lw_aichan_bot_check';

type Body = {
    ok: boolean;
    lw_aichan_bot_check:
    | {
        ok: true;
        scannedGroupCount: number;
        targetGroupCount: number;
        alertsCreated: number;
        alertsUpdated: number;
        skippedNoCsId: number;
        skippedNoRecentShift: number;
    }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        lw_aichan_bot_check: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][lw_aichan_bot_check] start');
        const r = await runLwAiChanBotCheck();
        console.info('[cron][lw_aichan_bot_check] end', r);

        result.lw_aichan_bot_check = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][lw_aichan_bot_check] error', msg);

        result.ok = false;
        result.lw_aichan_bot_check = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}