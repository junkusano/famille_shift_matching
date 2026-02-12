// src/app/api/cron/disability-check-record-check-test/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runDisabilityCheckDailyAlerts } from "@/lib/alert_add/disability_check_unsubmitted_alert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        // 任意：本番で誤作動させたくないならガード（必要ならON）
        // if (process.env.DISABILITY_CHECK_TEST_MODE !== "true") {
        //   return NextResponse.json({ ok: false, error: "test mode is disabled" }, { status: 403 });
        // }

        const url = new URL(req.url);

        const qp = url.searchParams.get("kaipoke_cs_id");
        const envId = process.env.DISABILITY_CHECK_TEST_KAIPOKE_CS_ID;
        const kaipoke_cs_id = (qp && qp.trim()) || (envId && envId.trim()) || "";

        if (!kaipoke_cs_id) {
            return NextResponse.json(
                { ok: false, error: "kaipoke_cs_id is required (query or env DISABILITY_CHECK_TEST_KAIPOKE_CS_ID)" },
                { status: 400 },
            );
        }

        // ★提出だけ（LINE送信テスト目的）
        const modeRaw = "submittedOnly" as const;

        // ★本当に送る（終わったら true 推奨）
        const dryRun = false;

        // ★日付条件を無視して提出を必ず動かす
        const forceDay10Rule = true;

        // submittedOnly なので forceDay15Rule は不要（誤解防止で false）
        const forceDay15Rule = false;

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
        const message = e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
