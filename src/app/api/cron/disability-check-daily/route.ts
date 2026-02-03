// src/app/api/cron/disability-check-record-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runDisabilityCheckDailyAlerts } from "@/lib/alert_add/disability_check_unsubmitted_alert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const result = await runDisabilityCheckDailyAlerts({
            dryRun: false,
            mode: "submittedOnly",
            // ★検証したい1件の利用者に絞る（kaipoke_cs_id を入れる）
            targetKaipokeCsId: "ここにテスト対象のkaipoke_cs_id",
            // ★今日が10日未満でも試したい場合だけ true（本番は消す/false）
            // forceDay10Rule: true,
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
