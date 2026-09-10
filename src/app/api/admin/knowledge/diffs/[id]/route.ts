import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";

type Context = { params: Promise<{ id: string }> };

function sourceIds(metadata: unknown) {
  const root = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const diff = root.knowledge_diff && typeof root.knowledge_diff === "object" && !Array.isArray(root.knowledge_diff) ? root.knowledge_diff as Record<string, unknown> : {};
  return Array.isArray(diff.sourceKnowledgeIds) ? diff.sourceKnowledgeIds.filter((value): value is string => typeof value === "string") : [];
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: Context) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  const { data: item, error: itemError } = await supabaseAdmin
    .from("knowledge_items").select("id,title,metadata")
    .eq("id", id).eq("knowledge_type", "delta").eq("is_current", true).maybeSingle();
  if (itemError) return NextResponse.json({ ok: false, error: "差分ナレッジを取得できませんでした。" }, { status: 500 });
  if (!item) return NextResponse.json({ ok: false, error: "差分ナレッジが見つかりません。" }, { status: 404 });
  const ids = sourceIds(item.metadata);
  const { data: sources, error: sourceError } = ids.length
    ? await supabaseAdmin.from("knowledge_items").select("id,knowledge_key,title,summary,knowledge_type,category,importance,updated_at").in("id", ids).order("importance", { ascending: false })
    : { data: [], error: null };
  if (sourceError) return NextResponse.json({ ok: false, error: "元ナレッジを取得できませんでした。" }, { status: 500 });
  return NextResponse.json({ ok: true, item, sources: sources ?? [] });
}
