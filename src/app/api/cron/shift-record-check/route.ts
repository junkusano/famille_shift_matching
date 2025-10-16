// /api/cron/shift-records/check/route.ts
import { NextResponse } from "next/server";
import { runShiftRecordCheck } from "@/lib/shiftRecordCheck";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (req.headers.get("x-cron-key") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
  }
  // ← ここがポイント：dryRun: true で呼ぶ
  const result = await runShiftRecordCheck({ dryRun: true });
  return NextResponse.json({ source: "cron-api", ...result });
}
