import { NextRequest, NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireManagerOrAdmin(request);
  if (denied) return denied;
  const { id } = await context.params;
  const { data, error } = await supabaseAdmin.from("knowledge_automation_runs")
    .select("id,status,created_at,output_summary,error_message").eq("task_id", id)
    .order("created_at", { ascending: false }).limit(5);
  if (error) return NextResponse.json({ error: "診断履歴を取得できませんでした。" }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
