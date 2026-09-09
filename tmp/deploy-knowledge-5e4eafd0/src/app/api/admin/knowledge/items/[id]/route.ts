import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { recordOperationLog } from "@/lib/cm/audit/recordOperationLog";
import { supabaseAdmin } from "@/lib/supabase/service";
import { knowledgeItemInputSchema, validatePublicationSafety } from "@/lib/knowledge/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  const { data, error } = await supabaseAdmin
    .from("knowledge_items")
    .select("*,primary_source:knowledge_sources(name,source_type),evidence:knowledge_evidence_links(*,source_object:knowledge_source_objects(id,title,object_type,source_url,drive_url,occurred_at,privacy_level,locator))")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "ナレッジを取得できませんでした。" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "ナレッジが見つかりません。" }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  const parsed = knowledgeItemInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "入力内容を確認してください。", details: parsed.error.flatten() }, { status: 400 });
  }
  const safetyError = validatePublicationSafety(parsed.data);
  if (safetyError) return NextResponse.json({ ok: false, error: safetyError }, { status: 400 });
  const approved = parsed.data.review_status === "approved";
  const { data, error } = await supabaseAdmin
    .from("knowledge_items")
    .update({
      ...parsed.data,
      content: parsed.data.content || null,
      source_url: parsed.data.source_url || null,
      drive_url: parsed.data.drive_url || null,
      occurred_at: parsed.data.occurred_at || null,
      period_start: parsed.data.period_start || null,
      period_end: parsed.data.period_end || null,
      category: parsed.data.category || null,
      public_summary: parsed.data.public_summary || null,
      authorship: "human",
      approved_by: approved ? auth.actor.authUser.id : null,
      approved_at: approved ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("is_current", true)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "ナレッジを更新できませんでした。" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "更新対象が見つかりません。" }, { status: 404 });
  await recordOperationLog({
    userId: auth.actor.userId ?? auth.actor.authUser.id,
    action: "knowledge.item.update",
    category: "knowledge",
    description: "ナレッジを編集",
    resourceType: "knowledge_item",
    resourceId: id,
    metadata: { reviewStatus: data.review_status, publishability: data.publishability },
  });
  return NextResponse.json({ ok: true, item: data });
}
