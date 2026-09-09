import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/supabase/service";

function monthStart(value: string): string | null {
  return /^\d{4}-\d{2}(-\d{2})?$/.test(value) ? `${value.slice(0, 7)}-01` : null;
}

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
    const todayJst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const currentMonth = `${todayJst.slice(0, 7)}-01`;
    const previous = new Date(`${currentMonth}T00:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    const defaultFrom = previous.toISOString().slice(0, 10);
    const from = monthStart(req.nextUrl.searchParams.get("from") ?? "") ?? defaultFrom;
    const to = monthStart(req.nextUrl.searchParams.get("to") ?? "") ?? currentMonth;
    const { data, error } = await supabaseAdmin.rpc("rebuild_staff_monthly_stats", { p_from: from, p_to: to });
    if (error) throw error;
    return NextResponse.json({ ok: true, from, to, rebuilt_months: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
