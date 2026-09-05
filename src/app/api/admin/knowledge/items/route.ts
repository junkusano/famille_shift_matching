import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { recordOperationLog } from "@/lib/cm/audit/recordOperationLog";
import { supabaseAdmin } from "@/lib/supabase/service";
import { knowledgeItemInputSchema, validatePublicationSafety } from "@/lib/knowledge/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function integerParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;

  const page = integerParam(request.nextUrl.searchParams.get("page"), 1, 1, 100_000);
  const perPage = integerParam(request.nextUrl.searchParams.get("perPage"), 30, 10, 100);
  const from = (page - 1) * perPage;
  let query = supabaseAdmin
    .from("knowledge_items")
    .select("*,primary_source:knowledge_sources(name,source_type)", { count: "exact" })
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .range(from, from + perPage - 1);

  const filters = ["knowledge_type", "category", "publishability", "review_status", "verification_status"] as const;
  for (const key of filters) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query = query.eq(key, value);
  }
  const privacy = request.nextUrl.searchParams.get("privacy_level");
  if (privacy && /^[0-3]$/.test(privacy)) query = query.eq("privacy_level", Number(privacy));
  const sourceId = request.nextUrl.searchParams.get("source_id");
  if (sourceId) query = query.eq("primary_source_id", sourceId);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "ナレッジを取得できませんでした。" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [], total: count ?? 0, page, perPage });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;

  const parsed = knowledgeItemInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "入力内容を確認してください。", details: parsed.error.flatten() }, { status: 400 });
  }
  const safetyError = validatePublicationSafety(parsed.data);
  if (safetyError) return NextResponse.json({ ok: false, error: safetyError }, { status: 400 });
  const now = new Date().toISOString();
  const approved = parsed.data.review_status === "approved";
  const payload = {
    ...parsed.data,
    content: parsed.data.content || null,
    source_url: parsed.data.source_url || null,
    drive_url: parsed.data.drive_url || null,
    occurred_at: parsed.data.occurred_at || null,
    period_start: parsed.data.period_start || null,
    period_end: parsed.data.period_end || null,
    category: parsed.data.category || null,
    public_summary: parsed.data.public_summary || null,
    knowledge_key: `manual.${randomUUID()}`,
    authorship: "human",
    created_by: auth.actor.authUser.id,
    approved_by: approved ? auth.actor.authUser.id : null,
    approved_at: approved ? now : null,
  };
  const { data, error } = await supabaseAdmin
    .from("knowledge_items")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: "ナレッジを保存できませんでした。" }, { status: 500 });
  }
  await recordOperationLog({
    userId: auth.actor.userId ?? auth.actor.authUser.id,
    action: "knowledge.item.create",
    category: "knowledge",
    description: "ナレッジを手動追加",
    resourceType: "knowledge_item",
    resourceId: data.id,
    metadata: { privacyLevel: data.privacy_level, publishability: data.publishability },
  });
  return NextResponse.json({ ok: true, item: data }, { status: 201 });
}
