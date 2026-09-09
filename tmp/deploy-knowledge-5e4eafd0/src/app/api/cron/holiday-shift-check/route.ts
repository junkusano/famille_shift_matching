import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { scanHolidayShifts } from "@/lib/holidayShift";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try { assertCronAuth(req); return NextResponse.json({ ok: true, ...(await scanHolidayShifts()) }); }
  catch (e) { const message = e instanceof Error ? e.message : String(e); console.error("[cron][holiday-shift] fatal", message); return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 }); }
}
