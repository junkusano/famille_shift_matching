export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runCsContractPlanCheck } from '@/lib/alert_add/cs_contract_plan_check';

type Body = {
    ok: boolean;
    cs_contract_plan_check:
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
        cs_contract_plan_check: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][cs_contract_plan_check] start');
        const r = await runCsContractPlanCheck();
        console.info('[cron][cs_contract_plan_check] end', r);

        result.cs_contract_plan_check = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][cs_contract_plan_check] error', msg);

        result.ok = false;
        result.cs_contract_plan_check = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}