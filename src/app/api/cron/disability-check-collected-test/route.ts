import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runDisabilityCheckDailyAlerts } from "@/lib/alert_add/disability_check_unsubmitted_alert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const url = new URL(req.url);

        // 必須：テストしたい kaipoke_cs_id を1件指定
        const kaipoke_cs_id = url.searchParams.get("kaipoke_cs_id") ?? "";
        if (!kaipoke_cs_id) {
            return NextResponse.json(
                { ok: false, error: "kaipoke_cs_id is required" },
                { status: 400 },
            );
        }

        // 任意：15日条件を無視してテストする（true のときだけ）
        const force = url.searchParams.get("force") === "true";

        // ★回収のみ、1件のみ、LINEWORKSなし
        const result = await runDisabilityCheckDailyAlerts({
            dryRun: true,              // 念のため（LINEWORKS側が動かないように）
            mode: "collectedOnly",     // 回収だけ
            targetKaipokeCsId: kaipoke_cs_id,
            // force を使う場合は lib 側の runCollected... に反映している前提
            // まだ対応してないなら、まずは15日以降にテスト or libに force対応を入れてください
        });

        return NextResponse.json({
            ok: true,
            source: "cron/disability-check-collected-test",
            force,
            ...result,
        });
    } catch (e) {
        console.error("[cron][disability-check-collected-test] error", e);
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
