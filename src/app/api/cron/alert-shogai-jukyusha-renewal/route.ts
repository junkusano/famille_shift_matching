import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runShogaiJukyushaRenewalAlerts } from "@/lib/disability/shogaiJukyushaRenewalAlert";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
    const { searchParams } = req.nextUrl;
    const result = await runShogaiJukyushaRenewalAlerts({
      targetKaipokeCsId: searchParams.get("targetKaipokeCsId") ?? undefined,
      asOf: searchParams.get("asOf") ?? undefined,
      forceDay15Rule: searchParams.get("force") === "true",
      dryRun: searchParams.get("dryRun") === "true",
    });
    return NextResponse.json({ ok: true, source: "cron/alert-shogai-jukyusha-renewal", ...result });
  } catch (error) {
    console.error("[cron][alert-shogai-jukyusha-renewal] failed", error);
    return NextResponse.json({ ok: false, error: "alert_failed" }, { status: 500 });
  }
}
