import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runKnowledgeSource } from "@/lib/knowledge/pipeline";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const incoming = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const expected = process.env.CRON_SECRET;
  if (!incoming || !expected) return false;
  const actualBuffer = Buffer.from(incoming);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { data: sources, error } = await supabaseAdmin
    .from("knowledge_sources")
    .select("id")
    .eq("enabled", true)
    .neq("sync_frequency", "manual")
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at")
    .limit(3);
  if (error) return NextResponse.json({ ok: false, error: "Source lookup failed" }, { status: 500 });
  const results = [];
  for (const source of sources ?? []) {
    try {
      const result = await runKnowledgeSource({ sourceId: source.id, jobType: "incremental", triggerType: "cron" });
      results.push({ sourceId: source.id, ok: true, runId: result.runId, processed: result.processed });
    } catch (runError) {
      results.push({ sourceId: source.id, ok: false, error: runError instanceof Error ? runError.message : "Sync failed" });
    }
  }
  return NextResponse.json({ ok: true, count: results.length, results });
}

