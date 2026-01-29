// src/app/api/cron/disability-check-daily/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runDisabilityCheckDailyAlerts } from "@/lib/alert_add/disability_check_unsubmitted_alert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const result = await runDisabilityCheckDailyAlerts({ dryRun: false });

        return NextResponse.json({
            ok: true,
            source: "cron/disability-check-daily",
            ...result,
        });
    } catch (e) {
        console.error("[cron][disability-check-daily] fatal unauthorized_cron", e);
        return NextResponse.json(
            { ok: false, error: "unauthorized_cron" },
            { status: 401 },
        );
    }
}
