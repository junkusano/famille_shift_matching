import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { data, error } = await supabaseAdmin
    .from("knowledge_sources")
    .select("*,checkpoint:knowledge_source_checkpoints(cursor,cursor_version,last_success_at)")
    .order("name");
  if (error) return NextResponse.json({ ok: false, error: "情報源を取得できませんでした。" }, { status: 500 });
  return NextResponse.json({ ok: true, sources: data ?? [] });
}
