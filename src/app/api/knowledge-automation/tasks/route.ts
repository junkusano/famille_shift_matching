import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { calculateAutomationNextRunAt } from "@/lib/knowledge-automation/scheduling";
import { knowledgeAutomationTaskInputSchema } from "@/lib/knowledge-automation/validation";
import { supabaseAdmin } from "@/lib/supabase/service";

function databaseError(error: { code?: string; message?: string } | null) {
  if (error?.code === "42P01") {
    return NextResponse.json({ ok: false, error: "自動化管理のデータベース設定がまだ適用されていません。" }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: "自動化タスクを処理できませんでした。" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("knowledge_automation_tasks")
    .select("*")
    .order("is_enabled", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) return databaseError(error);
  return NextResponse.json({ ok: true, tasks: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;

  const parsed = knowledgeAutomationTaskInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" }, { status: 400 });
  }

  const { user } = await getUserFromBearer(request);
  const input = parsed.data;
  const nextRunAt = calculateAutomationNextRunAt(input.trigger_type, input.schedule, input.is_enabled);
  const { data, error } = await supabaseAdmin.from("knowledge_automation_tasks").insert({
    name: input.name,
    description: input.description || null,
    task_type: input.task_type,
    trigger_type: input.trigger_type,
    schedule: input.schedule,
    destination: input.destination,
    approval_mode: input.approval_mode,
    condition_summary: input.condition_summary || null,
    settings: input.settings,
    timezone: "Asia/Tokyo",
    privacy_filter_enabled: true,
    compliance_filter_enabled: true,
    safety_policy_version: "common-v1",
    is_enabled: input.is_enabled,
    next_run_at: nextRunAt,
    created_by: user?.id ?? null,
    updated_by: user?.id ?? null,
  }).select("*").single();
  if (error) return databaseError(error);
  return NextResponse.json({ ok: true, task: data }, { status: 201 });
}
