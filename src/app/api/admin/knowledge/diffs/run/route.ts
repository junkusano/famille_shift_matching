import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { recordOperationLog } from "@/lib/cm/audit/recordOperationLog";
import { runKnowledgeDiff } from "@/lib/knowledge/diff";

const requestSchema = z.object({ dry_run: z.boolean().default(false) });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "実行内容を確認してください。" }, { status: 400 });
  try {
    const result = await runKnowledgeDiff({ trigger: "manual", dryRun: parsed.data.dry_run });
    await recordOperationLog({
      userId: auth.actor.userId ?? auth.actor.authUser.id,
      action: "knowledge.diff.run",
      category: "knowledge",
      description: parsed.data.dry_run ? "差分ナレッジをプレビュー" : "差分ナレッジを手動生成",
      resourceType: "knowledge_diff_run",
      resourceId: result.runId,
      metadata: { dryRun: parsed.data.dry_run, sourceCount: result.sourceCount, resultCount: result.resultCount },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "差分ナレッジの生成に失敗しました。" }, { status: 500 });
  }
}
