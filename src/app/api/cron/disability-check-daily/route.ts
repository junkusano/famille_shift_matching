// src/app/api/cron/disability-check-record-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runDisabilityCheckDailyAlerts } from "@/lib/disability/disability_check_unsubmitted_alert";
import { refreshDisabilityCheckJissekiStaff } from "@/lib/disabilityCheckJisseki";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);
        await refreshDisabilityCheckJissekiStaff(); // ★追加（送信前に同期）
        const result = await runDisabilityCheckDailyAlerts({
            dryRun: false,
            mode: "submittedOnly", // ★提出のみ
            // ★全件なので targetKaipokeCsId は渡さない
            // ★本番は日付条件を効かせるので forceDay10Rule/15Rule も渡さない
        });

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
