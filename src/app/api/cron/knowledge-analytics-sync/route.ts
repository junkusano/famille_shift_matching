import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runKnowledgeSource } from "@/lib/knowledge/pipeline";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Clarity's short retention requires daily snapshots, independent of slow/failed sources.
export async function GET(request: NextRequest) {
  const actual = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "");
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ ok: false }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("knowledge_sources").select("id")
    .eq("enabled", true).neq("sync_frequency", "manual").in("connector_key", ["google_analytics", "microsoft_clarity"])
    .lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(8);
  if (error) return NextResponse.json({ ok: false, error: "アクセス情報源の取得に失敗しました。" }, { status: 500 });
  const results = await Promise.all((data ?? []).map(async source => {
    try {
      const result = await runKnowledgeSource({ sourceId: source.id, jobType: "incremental", triggerType: "cron" });
      return { sourceId: source.id, ok: true, runId: result.runId };
    } catch { return { sourceId: source.id, ok: false, message: "集計できませんでした。ナレッジ管理の同期履歴を確認してください。" }; }
  }));
  const ok = results.every(r => r.ok);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 });
}
