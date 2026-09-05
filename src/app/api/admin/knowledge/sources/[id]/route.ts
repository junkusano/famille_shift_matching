import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { recordOperationLog } from "@/lib/cm/audit/recordOperationLog";
import { calculateNextRunAt } from "@/lib/knowledge/scheduling";
import type { KnowledgeSource } from "@/lib/knowledge/types";
import { sourceUpdateSchema } from "@/lib/knowledge/validation";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  const parsed = sourceUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "設定内容を確認してください。" }, { status: 400 });

  const { data: current, error: currentError } = await supabaseAdmin.from("knowledge_sources").select("*").eq("id", id).maybeSingle();
  if (currentError) return NextResponse.json({ ok: false, error: "情報源を取得できませんでした。" }, { status: 500 });
  if (!current) return NextResponse.json({ ok: false, error: "情報源が見つかりません。" }, { status: 404 });
  const merged = { ...current, ...parsed.data } as KnowledgeSource;
  const update = {
    ...parsed.data,
    next_run_at: parsed.data.next_run_at !== undefined
      ? parsed.data.next_run_at
      : calculateNextRunAt(merged),
  };
  const { data, error } = await supabaseAdmin.from("knowledge_sources").update(update).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: "情報源を更新できませんでした。" }, { status: 500 });
  await recordOperationLog({
    userId: auth.actor.userId ?? auth.actor.authUser.id,
    action: "knowledge.source.update",
    category: "knowledge",
    description: "ナレッジ情報源設定を更新",
    resourceType: "knowledge_source",
    resourceId: id,
    metadata: { enabled: data.enabled, syncFrequency: data.sync_frequency },
  });
  return NextResponse.json({ ok: true, source: data });
}
