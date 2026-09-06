import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { calculateAutomationNextRunAt } from "@/lib/knowledge-automation/scheduling";
import { knowledgeAutomationTaskInputSchema } from "@/lib/knowledge-automation/validation";
import { supabaseAdmin } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "タスクIDが正しくありません。" }, { status: 400 });
  }
  const parsed = knowledgeAutomationTaskInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" }, { status: 400 });
  }

  const { user } = await getUserFromBearer(request);
  const input = parsed.data;
  const { data, error } = await supabaseAdmin.from("knowledge_automation_tasks").update({
    name: input.name,
    description: input.description || null,
    task_type: input.task_type,
    trigger_type: input.trigger_type,
    schedule: input.schedule,
    destination: input.destination,
    approval_mode: input.approval_mode,
    condition_summary: input.condition_summary || null,
    settings: input.settings,
    is_enabled: input.is_enabled,
    next_run_at: calculateAutomationNextRunAt(input.trigger_type, input.schedule, input.is_enabled),
    updated_by: user?.id ?? null,
  }).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "自動化タスクを更新できませんでした。" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "自動化タスクが見つかりません。" }, { status: 404 });
  return NextResponse.json({ ok: true, task: data });
}
