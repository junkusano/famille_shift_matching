import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  try {
    assertCronAuth(req);
    const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string };
    const from = /^\d{4}-\d{2}(-\d{2})?$/.test(body.from ?? "") ? `${body.from!.slice(0, 7)}-01` : "2025-07-01";
    const jstToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
    const to = /^\d{4}-\d{2}(-\d{2})?$/.test(body.to ?? "") ? `${body.to!.slice(0, 7)}-01` : `${jstToday.slice(0, 7)}-01`;
    const { data, error } = await supabaseAdmin.rpc("rebuild_staff_monthly_stats", { p_from: from, p_to: to });
    if (error) throw error;
    return NextResponse.json({ ok: true, from, to, rebuilt_months: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
