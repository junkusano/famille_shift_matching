// src/app/api/cron/logic-shift-staff-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runShiftStaffCheck } from "@/lib/shift/shift-staff-check";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const { searchParams } = new URL(req.url);

    // テスト用にURLで調整できるように（cronは通常パラメータ無しでOK）
    const dryRun = searchParams.get("dryRun") === "true";
    const daysAhead = Number(searchParams.get("daysAhead") ?? "21"); // 何日先のシフトまで見るか
    const inactiveDays = Number(searchParams.get("inactiveDays") ?? "15"); // 何日空いてたらアラートか

    const result = await runShiftStaffCheck({
      dryRun,
      daysAhead,
      inactiveDays,
    });

    return NextResponse.json({
      ok: true,
      source: "cron/logic_shift_staff_check",
      ...result,
    });
  } catch (e) {
    console.error("[cron][logic_shift_staff_check] fatal unauthorized_cron", e);
    return NextResponse.json({ ok: false, error: "unauthorized_cron" }, { status: 401 });
  }
}
