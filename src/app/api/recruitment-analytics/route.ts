import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";
import { RECRUITMENT_REPORT_TYPE } from "@/lib/knowledge-automation/recruitmentAnalyticsCore";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied = await requireManagerOrAdmin(request);
  if (denied) return denied;
  const { data, error } = await supabaseAdmin.from("knowledge_items")
    .select("id,title,summary,content,period_start,period_end,created_at,metadata")
    .eq("knowledge_type", RECRUITMENT_REPORT_TYPE).eq("is_current", true)
    .eq("contains_personal_data", false).lte("privacy_level", 1)
    .order("period_start", { ascending: false }).limit(52);
  if (error) return NextResponse.json({ error: "レポートを取得できませんでした。" }, { status: 500 });
  return NextResponse.json({ reports: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
