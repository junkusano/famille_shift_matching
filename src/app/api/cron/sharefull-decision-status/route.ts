import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { sharefullDecisionStatusTableName, sharefullSyncClientIds, sharefullRequestTableName, sharefullRpaMode, shouldRunSharefullDecisionMonitor } from "@/lib/spot-sync/sharefullScope";
import { sharefullDecisionBatch } from "@/lib/spot-sync/sharefullDecisionBatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!secret || !supplied) return false;
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function jstSlot(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const minute = Math.floor(Number(get("minute")) / 5) * 5;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${String(minute).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!shouldRunSharefullDecisionMonitor()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "test_only_monitor_disabled_or_wrong_environment" });
  }
  const environment = sharefullRpaMode();
  const runnerId = process.env.SHAREFULL_DECISION_RUNNER_ID?.trim();
  if (!runnerId) return NextResponse.json({ ok: false, error: "Dedicated decision runner is not configured" }, { status: 503 });

  const { error: statusTableError } = await supabaseAdmin
    .from(sharefullDecisionStatusTableName() as never)
    .select("request_id")
    .limit(0);
  const { data: completionProbe, error: completionProbeError } = await supabaseAdmin.rpc(
    "complete_sharefull_test_decision_check",
    { p_job_id: randomUUID(), p_runner_id: runnerId, p_result: { observations: [] } },
  );
  if (statusTableError || completionProbeError || completionProbe !== null) {
    console.error("[cron/sharefull-decision-status] test database migration is not ready", {
      tableCode: statusTableError?.code,
      rpcCode: completionProbeError?.code,
    });
    return NextResponse.json({ ok: false, error: "Sharefull decision monitor database is not ready" }, { status: 503 });
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const clientIds = sharefullSyncClientIds();

  let countQuery = supabaseAdmin.from(sharefullRequestTableName() as never)
    .select("id", { count: "exact", head: true })
    .eq("status", "募集中").eq("sharefull_status", "published")
    .not("sharefull_job_id", "is", null).not("sharefull_order_id", "is", null)
    .gte("shift_start_date", today);
  if (clientIds) countQuery = countQuery.in("kaipoke_cs_id", clientIds);
  const { count, error: countError } = await countQuery;
  if (countError || count === null) {
    console.error("[cron/sharefull-decision-status] candidate count unavailable", { code: countError?.code });
    return NextResponse.json({ ok: false, error: "Decision candidate count unavailable" }, { status: 500 });
  }
  if (count === 0) return NextResponse.json({ ok: true, registered: 0, target_count: 0 });

  const batchSize = 30;
  const slotNumber = Math.floor(Date.now() / 300_000);
  const { batchCount, batchIndex, from, to } = sharefullDecisionBatch(count, slotNumber, batchSize);
  let query = supabaseAdmin.from(sharefullRequestTableName() as never)
    .select("id, kaipoke_cs_id, sharefull_job_id, sharefull_order_id")
    .eq("status", "募集中").eq("sharefull_status", "published")
    .not("sharefull_job_id", "is", null).not("sharefull_order_id", "is", null)
    .gte("shift_start_date", today).order("shift_start_date", { ascending: true })
    .order("id", { ascending: true }).range(from, to);
  if (clientIds) query = query.in("kaipoke_cs_id", clientIds);
  const { data, error } = await query;
  if (error) {
    console.error("[cron/sharefull-decision-status] candidates unavailable", { code: error.code });
    return NextResponse.json({ ok: false, error: "Decision candidates unavailable" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const validTargets = rows.flatMap((row) => {
    const requestId = typeof row.id === "string" ? row.id : "";
    const orderId = typeof row.sharefull_order_id === "string" ? row.sharefull_order_id : "";
    const jobId = typeof row.sharefull_job_id === "string" ? row.sharefull_job_id : "";
    if (!requestId || !/^[1-9]\d*$/.test(orderId) || !/^[1-9]\d*$/.test(jobId)) return [];
    return [{ spot_offer_request_id: requestId, sharefull_order_id: orderId, sharefull_job_id: jobId }];
  });
  const targets = validTargets;
  if (!targets.length) return NextResponse.json({ ok: true, registered: 0, target_count: 0 });

  const key = `sharefull:decision:${jstSlot()}:${batchIndex}`;
  const { error: insertError } = await supabaseAdmin.from("rpa_runner_jobs").insert({
    job_type: "sharefull.check_decision_status",
    status: "pending",
    target_runner_id: runnerId,
    timeout_ms: 120_000,
    payload: { sync_operation_key: key, environment, rpa_mode: environment, targets },
  });
  if (insertError?.code === "23505") {
    return NextResponse.json({ ok: true, registered: 0, duplicate: true, target_count: targets.length, batch_index: batchIndex });
  }
  if (insertError) {
    console.error("[cron/sharefull-decision-status] job enqueue failed", { code: insertError.code });
    return NextResponse.json({ ok: false, error: "Decision job enqueue failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, registered: 1, target_count: targets.length, batch_index: batchIndex, batch_count: batchCount });
}
