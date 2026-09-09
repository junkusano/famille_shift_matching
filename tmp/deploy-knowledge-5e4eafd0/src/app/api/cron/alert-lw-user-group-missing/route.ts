export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { lwUserGroupMissingCheck } from '@/lib/alert_add/lw_user_group_missing_check';

type Body = {
    ok: boolean;
    lw_user_group_missing_check:
    | { ok: true; scanned: number; created: number }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        lw_user_group_missing_check: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][lw_user_group_missing_check] start');
        const r = await lwUserGroupMissingCheck();
        console.info('[cron][lw_user_group_missing_check] end', r);

        result.lw_user_group_missing_check = { ok: true, ...r };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][lw_user_group_missing_check] error', msg);

        result.ok = false;
        result.lw_user_group_missing_check = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}