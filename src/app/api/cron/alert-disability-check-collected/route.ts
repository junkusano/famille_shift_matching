export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { refreshDisabilityCheckJissekiStaff } from "@/lib/disabilityCheckJisseki";
import { runDisabilityCheckCollectedAlert } from "@/lib/alert_add/disability_check_collected_alert";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        // 回収情報を同期してから alert を生成
        await refreshDisabilityCheckJissekiStaff();

        const result = await runDisabilityCheckCollectedAlert({ dryRun: false });

        return NextResponse.json({
            ok: true,
            source: "cron/disability-check-collected",
            ...result,
        });
    } catch (e) {
        console.error("[cron][disability-check-collected] fatal", e);
        return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
    }
}