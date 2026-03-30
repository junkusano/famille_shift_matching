export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { kodoengoPlanLinkCheck } from '@/lib/alert_add/kodoengo_plan_link_check';

type Body = {
    ok: boolean;
    kodoengo_plan_link_check:
    | { ok: true; scanned: number; created: number }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        kodoengo_plan_link_check: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][kodoengo_plan_link_check] start');
        const r = await kodoengoPlanLinkCheck();
        console.info('[cron][kodoengo_plan_link_check] end', r);

        result.kodoengo_plan_link_check = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][kodoengo_plan_link_check] error', msg);

        result.ok = false;
        result.kodoengo_plan_link_check = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}