import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runMonthlyMeetingUncheckedAlertbar } from "@/lib/alert_add/monthly_meeting_unchecked_alertbar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const result = await runMonthlyMeetingUncheckedAlertbar({
            dryRun: false,
        });

        return NextResponse.json({
            ok: true,
            source: "cron/alert-monthly-meeting-unchecked",
            ...result,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[cron][alert-monthly-meeting-unchecked] fatal", msg);
        return NextResponse.json(
            { ok: false, error: msg },
            { status: 500 }
        );
    }
}