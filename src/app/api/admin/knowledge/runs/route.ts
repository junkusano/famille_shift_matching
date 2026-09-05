import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  let query = supabaseAdmin
    .from("knowledge_sync_runs")
    .select("*,source:knowledge_sources(name,source_type)", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(200);
  const sourceId = request.nextUrl.searchParams.get("source_id");
  const status = request.nextUrl.searchParams.get("status");
  const jobType = request.nextUrl.searchParams.get("job_type");
  const dateFrom = request.nextUrl.searchParams.get("date_from");
  const dateTo = request.nextUrl.searchParams.get("date_to");
  if (sourceId) query = query.eq("source_id", sourceId);
  if (status) query = query.eq("status", status);
  if (jobType) query = query.eq("job_type", jobType);
  if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00+09:00`);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59+09:00`);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ ok: false, error: "同期履歴を取得できませんでした。" }, { status: 500 });
  return NextResponse.json({ ok: true, runs: data ?? [], total: count ?? 0 });
}
