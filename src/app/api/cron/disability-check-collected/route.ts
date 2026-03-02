// src/app/api/cron/disability-check-collected/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { refreshDisabilityCheckJissekiStaff } from "@/lib/disabilityCheckJisseki";
import { runDisabilityCheckCollectedAlert } from "@/lib/alert_add/disability_check_collected_alert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        // 回収も view の担当情報を使うので、提出と同様に同期してから回すのが安全
        await refreshDisabilityCheckJissekiStaff();

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