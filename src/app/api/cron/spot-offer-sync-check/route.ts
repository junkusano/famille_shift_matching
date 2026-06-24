import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runSpotOfferSyncCheck } from "@/lib/spot_offer/spot_offer_sync_check";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const result = await runSpotOfferSyncCheck({
      dryRun: false,
    });

    return NextResponse.json({
      ok: true,
      source: "spot-offer-sync-check",
      ...result,
    });
  } catch (e) {
    console.error("[spot-offer-sync-check]", e);

    return NextResponse.json(
      {
        ok: false,
        error: "cron_failed",
      },
      {
        status: 500,
      }
    );
  }
}