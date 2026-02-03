// 例: src/app/api/cron/disability-check-record-check-test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runDisabilityCheckDailyAlerts } from "@/lib/alert_add/disability_check_unsubmitted_alert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const url = new URL(req.url);

        // 必須：1件テスト用
        const qp = url.searchParams.get("kaipoke_cs_id");
        const envId = process.env.DISABILITY_CHECK_TEST_KAIPOKE_CS_ID;
        const kaipoke_cs_id = (qp && qp.trim()) || (envId && envId.trim()) || "";

        if (!kaipoke_cs_id) {
            return NextResponse.json(
                { ok: false, error: "kaipoke_cs_id is required (query or env DISABILITY_CHECK_TEST_KAIPOKE_CS_ID)" },
                { status: 400 },
            );
        }

        // 任意：submittedOnly / collectedOnly / all
        const modeRaw = (url.searchParams.get("mode") ?? "collectedOnly") as
            | "all"
            | "collectedOnly"
            | "submittedOnly";

        // 任意：dryRun（デフォルト true）
        const dryRun = (url.searchParams.get("dryRun") ?? "true") !== "false";

        // 任意：日付条件を無視してテスト
        const forceDay10Rule = url.searchParams.get("forceDay10Rule") === "true";
        const forceDay15Rule = url.searchParams.get("forceDay15Rule") === "true";

        const result = await runDisabilityCheckDailyAlerts({
            dryRun,
            mode: modeRaw,
            targetKaipokeCsId: kaipoke_cs_id,
            forceDay10Rule,
            forceDay15Rule,
        });

        return NextResponse.json({
            ok: true,
            source: "cron/disability-check-record-check-test",
            args: { kaipoke_cs_id, mode: modeRaw, dryRun, forceDay10Rule, forceDay15Rule },
            ...result,
        });
    } catch (e: unknown) {
        console.error("[cron][disability-check-record-check-test] error", e);

        const message =
            e instanceof Error
                ? e.message
                : typeof e === "string"
                    ? e
                    : "unknown error";

        return NextResponse.json(
            { ok: false, error: message },
            { status: 500 },
        );
    }
}