import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { processMonitoringBulkItem } from "@/lib/monitoring/bulk";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const { token } = await getUserFromBearer(request);
    if (!token) throw new Error("認証が必要です");
    const { id } = await params;
    const run = await db.from("monitoring_bulk_runs").select("*").eq("id", id).single();
    if (run.error) throw run.error;
    if (run.data.status !== "running") return NextResponse.json({ ok: true, done: true });
    const claim = await db.rpc("claim_monitoring_bulk_item", { p_run_id: id });
    if (claim.error) throw claim.error;
    const item = claim.data?.[0];
    if (item) {
      try {
        const result = await processMonitoringBulkItem({ run: run.data, item, actor, accessToken: token });
        const saved = await db.from("monitoring_bulk_run_items").update({
          status: result.status, note: result.note,
          monitoring_id: "monitoringId" in result ? result.monitoringId : null,
          event_task_id: "taskId" in result ? result.taskId : null, processed_at: new Date().toISOString(),
        }).eq("id", item.id);
        if (saved.error) throw saved.error;
      } catch (error) {
        const failed = await db.from("monitoring_bulk_run_items").update({ status: "error", note: error instanceof Error ? error.message : String(error), processed_at: new Date().toISOString() }).eq("id", item.id);
        if (failed.error) throw failed.error;
      }
    }
    const items = await db.from("monitoring_bulk_run_items").select("status,processed_at").eq("run_id", id).limit(10000);
    if (items.error) throw items.error;
    const rows = items.data ?? [];
    const count = (status: string) => rows.filter(row => row.status === status).length;
    const done = count("pending") + count("processing") === 0;
    const saved = await db.from("monitoring_bulk_runs").update({
      sent_count: count("sent"), task_count: count("task_created"), skipped_count: count("skipped"), error_count: count("error"),
      last_sent_at: rows.filter(row => row.status === "sent").map(row => row.processed_at).sort().at(-1) ?? null,
      ...(done ? { status: "completed", finished_at: new Date().toISOString() } : {}),
    }).eq("id", id);
    if (saved.error) throw saved.error;
    return NextResponse.json({ ok: true, done, busy: !item && !done });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
