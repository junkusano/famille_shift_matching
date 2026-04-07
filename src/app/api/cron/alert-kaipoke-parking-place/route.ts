export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runKaipokeParkingPlaceCheck } from '@/lib/alert_add/kaipoke_parking_place_check';

type Body = {
    ok: boolean;
    kaipoke_parking_place_check:
    | {
        ok: true;
        scannedShiftCount: number;
        scannedClientCount: number;
        targetClientCount: number;
        alertsCreated: number;
        alertsUpdated: number;
    }
    | { ok: false; error: string };
};

export async function GET(req: NextRequest) {
    const result: Body = {
        ok: true,
        kaipoke_parking_place_check: { ok: false, error: 'not executed' },
    };

    try {
        assertCronAuth(req);

        console.info('[cron][kaipoke_parking_place_check] start');
        const r = await runKaipokeParkingPlaceCheck();
        console.info('[cron][kaipoke_parking_place_check] end', r);

        result.kaipoke_parking_place_check = { ok: true, ...r };
        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        console.error('[cron][kaipoke_parking_place_check] error', msg);

        result.ok = false;
        result.kaipoke_parking_place_check = { ok: false, error: msg };

        return NextResponse.json(result, { status: 500 });
    }
}