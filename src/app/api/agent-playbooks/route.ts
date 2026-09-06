import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { agentPlaybookInputSchema } from "@/lib/agent-playbooks/validation";
import { supabaseAdmin } from "@/lib/supabase/service";

function databaseError(error: { code?: string } | null) {
  if (error?.code === "42P01") {
    return NextResponse.json(
      { ok: false, error: "スマートアイ業務ルールのデータベース設定がまだ適用されていません。" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: false, error: "業務ルールを処理できませんでした。" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("agent_playbooks")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) return databaseError(error);
  return NextResponse.json({ ok: true, playbooks: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;

  const parsed = agentPlaybookInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" },
      { status: 400 },
    );
  }

  const { user } = await getUserFromBearer(request);
  const input = parsed.data;
  const { data, error } = await supabaseAdmin.from("agent_playbooks").insert({
    name: input.name,
    description: input.description || null,
    category: input.category,
    room_scope: input.room_scope,
    trigger_mode: "lineworks_mention",
    execution_mode: "native_agent",
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
    is_locked: false,
    sort_order: 100,
    created_by: user?.id ?? null,
    updated_by: user?.id ?? null,
  }).select("*").single();

  if (error) return databaseError(error);
  return NextResponse.json({ ok: true, playbook: data }, { status: 201 });
}
