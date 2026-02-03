// src/app/api/cron/disability-check-record-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runDisabilityCheckRecordCheck } from "@/lib/disability/disability_check_record_check";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const result = await runDisabilityCheckRecordCheck({ dryRun: false });

        return NextResponse.json({
            ok: true,
            source: "cron/disability-check-record-check",
            ...result,
        });
    } catch (e) {
        console.error("[cron][disability-check-record-check] fatal unauthorized_cron", e);
        return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
    }
}
