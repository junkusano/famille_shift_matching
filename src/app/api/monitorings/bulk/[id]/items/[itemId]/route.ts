import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { processMonitoringBulkItem } from "@/lib/monitoring/bulk";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string; itemId: string }> };

async function updateRunCounts(runId: string) {
  const { data, error } = await db.from("monitoring_bulk_run_items").select("status,processed_at").eq("run_id", runId).limit(10_000);
  if (error) throw error;
  const rows = data ?? [];
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const { error: updateError } = await db.from("monitoring_bulk_runs").update({
    sent_count: count("sent"), task_count: count("task_created"), skipped_count: count("skipped"), error_count: count("error"),
    last_sent_at: rows.filter((row) => row.status === "sent").map((row) => row.processed_at).sort().at(-1) ?? null,
  }).eq("id", runId);
  if (updateError) throw updateError;
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const { token } = await getUserFromBearer(request);
    if (!token) throw new Error("認証が必要です");
    const { id, itemId } = await params;
    const [runResult, itemResult, activeResult] = await Promise.all([
      db.from("monitoring_bulk_runs").select("*").eq("id", id).single(),
      db.from("monitoring_bulk_run_items").select("*").eq("id", itemId).eq("run_id", id).single(),
      db.from("monitoring_bulk_run_items").select("id").eq("run_id", id).eq("status", "processing").limit(1),
    ]);
    if (runResult.error) throw runResult.error;
    if (itemResult.error) throw itemResult.error;
    if (activeResult.error) throw activeResult.error;
    if (activeResult.data?.length) return NextResponse.json({ ok: false, error: "同じ一斉送付の処理中の利用者がいます" }, { status: 409 });
    if (itemResult.data.monitoring_id || itemResult.data.status === "sent") {
      return NextResponse.json({ ok: false, error: "モニタリング作成済みのため個別画面で確認してください" }, { status: 409 });
    }
    const { error: claimError } = await db.from("monitoring_bulk_run_items").update({
      status: "processing", note: null, event_task_id: null, processed_at: null,
    }).eq("id", itemId).eq("run_id", id);
    if (claimError) throw claimError;
    try {
      const result = await processMonitoringBulkItem({ run: runResult.data, item: itemResult.data, actor, accessToken: token });
      const { error } = await db.from("monitoring_bulk_run_items").update({
        status: result.status, note: result.note,
        monitoring_id: "monitoringId" in result ? result.monitoringId : null,
        event_task_id: "taskId" in result ? result.taskId : null,
        processed_at: new Date().toISOString(),
      }).eq("id", itemId);
      if (error) throw error;
    } catch (error) {
      const { error: saveError } = await db.from("monitoring_bulk_run_items").update({
        status: "error", note: error instanceof Error ? error.message : String(error), processed_at: new Date().toISOString(),
      }).eq("id", itemId);
      if (saveError) throw saveError;
    }
    await updateRunCounts(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
