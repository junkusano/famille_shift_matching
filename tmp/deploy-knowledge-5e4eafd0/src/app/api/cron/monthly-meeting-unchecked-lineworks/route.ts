// src/app/api/cron/monthly-meeting-unchecked-lineworks/route.ts

import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runMonthlyMeetingUncheckedLineworksAlert } from "@/lib/alert_add/monthly_meeting_unchecked_lineworks_alert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const result = await runMonthlyMeetingUncheckedLineworksAlert({
            dryRun: false,
        });

        return NextResponse.json({
            ok: true,
            source: "cron/monthly-meeting-unchecked-lineworks",
            ...result,
        });
    } catch (e) {
        console.error("[cron][monthly-meeting-unchecked-lineworks] fatal", e);
        return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
    }
}