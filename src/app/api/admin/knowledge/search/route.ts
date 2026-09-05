import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ query: z.string().trim().min(1).max(100) });

export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "検索語を入力してください。" }, { status: 400 });
  const needle = parsed.data.query.toLocaleLowerCase("ja");
  const { data, error } = await supabaseAdmin
    .from("knowledge_items")
    .select("*,primary_source:knowledge_sources(name,source_type)")
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1_000);
  if (error) return NextResponse.json({ ok: false, error: "検索に失敗しました。" }, { status: 500 });
  const items = (data ?? []).filter((row) => {
    const haystack = [row.title, row.summary, row.content, row.category, ...(row.tags ?? [])]
      .filter(Boolean)
      .join("\n")
      .toLocaleLowerCase("ja");
    return haystack.includes(needle);
  }).slice(0, 100);
  return NextResponse.json({ ok: true, items, total: items.length });
}
