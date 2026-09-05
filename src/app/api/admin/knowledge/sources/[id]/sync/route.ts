import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { recordOperationLog } from "@/lib/cm/audit/recordOperationLog";
import { runKnowledgeSource } from "@/lib/knowledge/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  try {
    const result = await runKnowledgeSource({
      sourceId: id,
      jobType: "manual",
      triggerType: "manual",
      actorAuthUserId: auth.actor.authUser.id,
    });
    await recordOperationLog({
      userId: auth.actor.userId ?? auth.actor.authUser.id,
      action: "knowledge.source.sync",
      category: "knowledge",
      description: "ナレッジ情報源を手動同期",
      resourceType: "knowledge_source",
      resourceId: id,
      metadata: { runId: result.runId, processed: result.processed },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "同期に失敗しました。" }, { status: 500 });
  }
}
