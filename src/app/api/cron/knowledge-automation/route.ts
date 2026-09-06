import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runDueKnowledgeAutomations } from "@/lib/knowledge-automation/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const incoming = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const expected = process.env.CRON_SECRET;
  if (!incoming || !expected) return false;
  const actualBuffer = Buffer.from(incoming);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await runDueKnowledgeAutomations();
    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "自動化の定時実行に失敗しました。",
    }, { status: 500 });
  }
}
