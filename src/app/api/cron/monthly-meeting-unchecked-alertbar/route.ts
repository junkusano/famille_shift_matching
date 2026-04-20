// src/app/api/cron/monthly-meeting-unchecked-alertbar/route.ts

import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runMonthlyMeetingUncheckedAlertbar } from "@/lib/alert_add/monthly_meeting_unchecked_alertbar";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const result = await runMonthlyMeetingUncheckedAlertbar({
            dryRun: false,
            forceDay20Rule: true,
        });

        return NextResponse.json({
            ok: true,
            source: "cron/monthly-meeting-unchecked-alertbar",
            ...result,
        });
    } catch (e) {
        console.error("[cron][monthly-meeting-unchecked-alertbar] fatal", e);
        return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
    }
}