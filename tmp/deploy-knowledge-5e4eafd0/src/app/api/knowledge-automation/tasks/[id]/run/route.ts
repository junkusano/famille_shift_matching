import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { runKnowledgeAutomationTask } from "@/lib/knowledge-automation/runner";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(request: NextRequest, context: RouteContext) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "タスクIDが正しくありません。" }, { status: 400 });
  }
  const result = await runKnowledgeAutomationTask({ taskId: id, triggerSource: "manual" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
