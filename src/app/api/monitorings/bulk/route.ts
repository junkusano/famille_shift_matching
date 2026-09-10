import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { monthStart, monthEnd } from "@/lib/monitoring/core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    await requireMonitoringActor(request, { manage: true });
    const { data, error } = await db.from("monitoring_bulk_runs").select("*").order("started_at", { ascending: false }).limit(50);
    if (error) throw error;
    const runId = request.nextUrl.searchParams.get("run_id") || data?.[0]?.id;
    const items = runId ? await db.from("monitoring_bulk_run_items").select("*").eq("run_id", runId).order("created_at").limit(1000) : { data: [], error: null };
    if (items.error) throw items.error;
    return NextResponse.json({ ok: true, runs: data, items: items.data });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
    const [year, month] = today.split("-").map(Number);
    const targetMonth = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
    const start = monthStart(targetMonth), end = monthEnd(targetMonth);
    const template = await db.from("event_template").select("id").eq("is_active", true).eq("template_name", "マネジャー向け具体的な書類等対応（シフトアラート連動）").single();
    if (template.error) throw new Error("不備対応用イベントテンプレートを確認できません");
    // Page shifts explicitly: a full month exceeds the database's response limit.
    const ids = new Set<string>();
    for (let offset = 0; ; offset += 1000) {
      const shifts = await db.from("shift").select("shift_id,kaipoke_cs_id").gte("shift_start_date", start).lte("shift_start_date", end).order("shift_id").range(offset, offset + 999);
      if (shifts.error) throw shifts.error;
      for (const shift of shifts.data ?? []) if (shift.kaipoke_cs_id) ids.add(String(shift.kaipoke_cs_id));
      if ((shifts.data?.length ?? 0) < 1000) break;
    }
    const clients: Array<{ id: string; kaipoke_cs_id: string; name: string; asigned_org: string | null }> = [];
    const clientIds = [...ids];
    for (let offset = 0; offset < clientIds.length; offset += 100) {
      const result = await db.from("cs_kaipoke_info").select("id,kaipoke_cs_id,name,asigned_org").in("kaipoke_cs_id", clientIds.slice(offset, offset + 100));
      if (result.error) throw result.error;
      clients.push(...(result.data ?? []));
    }
    if (!clients.length) throw new Error("前月にシフトがある利用者がいません");
    const run = await db.from("monitoring_bulk_runs").insert({
      target_month: targetMonth, period_start: start, period_end: end, evaluation_date: today,
      event_template_id: template.data.id, target_count: clients.length, created_by: actor.userId, created_by_name: actor.name,
    }).select("*").single();
    if (run.error) throw new Error(run.error.code === "23505" ? "前月の一斉処理が実行中です。既存の処理を再開してください" : run.error.message);
    const items = await db.from("monitoring_bulk_run_items").insert(clients.map(client => ({ run_id: run.data.id, client_info_id: client.id, kaipoke_cs_id: client.kaipoke_cs_id, client_name: client.name, orgunitid: client.asigned_org })));
    if (items.error) {
      await db.from("monitoring_bulk_runs").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", run.data.id);
      throw items.error;
    }
    return NextResponse.json({ ok: true, run: run.data });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
