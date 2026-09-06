import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { agentPlaybookInputSchema } from "@/lib/agent-playbooks/validation";
import { supabaseAdmin } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "ルールIDが正しくありません。" }, { status: 400 });
  }

  const { data: current, error: findError } = await supabaseAdmin
    .from("agent_playbooks")
    .select("id,is_locked,locked_reason")
    .eq("id", id)
    .maybeSingle();
  if (findError) return NextResponse.json({ ok: false, error: "業務ルールを確認できませんでした。" }, { status: 500 });
  if (!current) return NextResponse.json({ ok: false, error: "業務ルールが見つかりません。" }, { status: 404 });
  if (current.is_locked) {
    return NextResponse.json(
      { ok: false, error: current.locked_reason || "この処理は保護されているため、この画面から変更できません。" },
      { status: 409 },
    );
  }

  const parsed = agentPlaybookInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" },
      { status: 400 },
    );
  }

  const { user } = await getUserFromBearer(request);
  const input = parsed.data;
  const { data, error } = await supabaseAdmin.from("agent_playbooks").update({
    name: input.name,
    description: input.description || null,
    category: input.category,
    room_scope: input.room_scope,
    situation: input.situation,
    instructions: input.instructions,
    trigger_examples: input.trigger_examples,
    allowed_actions: input.allowed_actions,
    context_message_limit: input.context_message_limit,
    context_minutes: input.context_minutes,
    confirmation_mode: input.confirmation_mode,
    approver_scope: input.approver_scope,
    session_ttl_minutes: input.session_ttl_minutes,
    is_enabled: input.is_enabled,
    updated_by: user?.id ?? null,
  }).eq("id", id).select("*").single();

  if (error) return NextResponse.json({ ok: false, error: "業務ルールを更新できませんでした。" }, { status: 500 });
  return NextResponse.json({ ok: true, playbook: data });
}
