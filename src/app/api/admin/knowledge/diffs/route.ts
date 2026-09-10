import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";

function sourceIds(metadata: unknown) {
  const root = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const diff = root.knowledge_diff && typeof root.knowledge_diff === "object" && !Array.isArray(root.knowledge_diff) ? root.knowledge_diff as Record<string, unknown> : {};
  return Array.isArray(diff.sourceKnowledgeIds) ? diff.sourceKnowledgeIds.filter((value): value is string => typeof value === "string") : [];
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const [itemsResult, runsResult] = await Promise.all([
    supabaseAdmin.from("knowledge_items")
      .select("id,title,summary,content,category,importance,period_start,period_end,created_at,updated_at,metadata,generation_model")
      .eq("knowledge_type", "delta").eq("is_current", true)
      .order("period_end", { ascending: false, nullsFirst: false }).limit(200),
    supabaseAdmin.from("knowledge_diff_runs")
      .select("id,status,dry_run,started_at,completed_at,from_at,to_at,source_count,result_count,error_message,result_summary")
      .order("started_at", { ascending: false }).limit(30),
  ]);
  if (itemsResult.error || runsResult.error) {
    return NextResponse.json({ ok: false, error: "差分ナレッジを取得できませんでした。" }, { status: 500 });
  }
  const items = (itemsResult.data ?? []).map((item) => ({ ...item, source_count: sourceIds(item.metadata).length }));
  return NextResponse.json({ ok: true, items, runs: runsResult.data ?? [] });
}
