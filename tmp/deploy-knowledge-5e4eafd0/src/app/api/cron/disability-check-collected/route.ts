// src/app/api/cron/disability-check-collected/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runDisabilityCheckCollectedAlert } from "@/lib/alert_add/disability_check_collected_alert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        // 手動設定済み担当を上書きする同期は行わない。未設定担当は表示API側で補完する。

        const result = await runDisabilityCheckCollectedAlert({
            dryRun: false,
            // 本番は日付条件を効かせるので forceDay15Rule は渡さない
            // 全件なので targetKaipokeCsId も渡さない
        });

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
