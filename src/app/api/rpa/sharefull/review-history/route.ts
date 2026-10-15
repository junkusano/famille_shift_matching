import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";

const OUTCOMES = new Set([
  "running", "skipped_busy", "no_pending_templates", "checked", "status_updated", "failed",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100_000;
}

function responseEntry(row: Record<string, unknown>) {
  return {
    id: row.id,
    sourceId: row.source_id,
    occurredAt: row.occurred_at,
    outcome: row.outcome,
    pendingTemplates: row.pending_templates,
    statusesUpdated: row.statuses_updated,
    publicationJobsRegistered: row.publication_jobs_registered,
    ...(typeof row.detail === "string" && row.detail ? { detail: row.detail } : {}),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const { data, error } = await supabaseAdmin
      .from("sharefull_review_monitor_history")
      .select("id,source_id,occurred_at,outcome,pending_templates,statuses_updated,publication_jobs_registered,detail")
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return NextResponse.json({ entries: (data ?? []).map((row) => responseEntry(row as Record<string, unknown>)) });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/review-history] read failed", error);
    return NextResponse.json({ error: "Sharefull審査監視履歴を取得できませんでした" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const entries = Array.isArray(body.entries) ? body.entries : [body];
    const replaceExisting = body.replaceExisting !== false;
    if (entries.length > 500) return NextResponse.json({ error: "一度に保存できる履歴は500件までです" }, { status: 413 });
    const rows: Array<Record<string, unknown>> = [];
    for (const value of entries) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return NextResponse.json({ error: "審査監視履歴の形式が不正です" }, { status: 400 });
      }
      const entry = value as Record<string, unknown>;
      const occurredAt = typeof entry.occurredAt === "string" ? entry.occurredAt : "";
      if (typeof entry.id !== "string" || !UUID.test(entry.id)
        || typeof entry.sourceId !== "string" || !UUID.test(entry.sourceId)
        || !Number.isFinite(Date.parse(occurredAt))
        || typeof entry.outcome !== "string" || !OUTCOMES.has(entry.outcome)
        || !safeCount(entry.pendingTemplates) || !safeCount(entry.statusesUpdated)
        || !safeCount(entry.publicationJobsRegistered)
        || (entry.detail !== undefined && typeof entry.detail !== "string")) {
        return NextResponse.json({ error: "審査監視履歴の形式が不正です" }, { status: 400 });
      }
      rows.push({
        id: entry.id,
        source_id: entry.sourceId,
        occurred_at: occurredAt,
        outcome: entry.outcome,
        pending_templates: entry.pendingTemplates,
        statuses_updated: entry.statusesUpdated,
        publication_jobs_registered: entry.publicationJobsRegistered,
        detail: typeof entry.detail === "string" ? entry.detail.trim().slice(0, 500) || null : null,
      });
    }
    if (!rows.length) return NextResponse.json({ ok: true });
    const { error } = await supabaseAdmin.from("sharefull_review_monitor_history").upsert(rows, {
      onConflict: "id",
      ignoreDuplicates: !replaceExisting,
    });
    if (error) throw error;
    const { error: pruneError } = await supabaseAdmin.rpc("prune_sharefull_review_monitor_history");
    if (pruneError) throw pruneError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/review-history] write failed", error);
    return NextResponse.json({ error: "Sharefull審査監視履歴を保存できませんでした" }, { status: 500 });
  }
}
