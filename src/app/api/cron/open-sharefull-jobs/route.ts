import { NextRequest, NextResponse } from "next/server";
import { enqueueSharefullPublicationJobsForReadyTemplates } from "@/lib/spot-offer/enqueueSharefullPublicationJob";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * ready_for_offer の案件について、Sharefull案件掲載用のRPA指示を登録する。
 *
 * vercel.json から5分ごとに呼ばれるが、SHAREFULL_AUTO_POST_ENABLED=true の場合だけ、
 * 実際に rpa_runner_jobs へ登録する。Runner側のジョブ種別が掲載処理を決定する。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await enqueueSharefullPublicationJobsForReadyTemplates("cron.open-sharefull-jobs");

  return NextResponse.json({
    ok: true,
    enabled: result.enabled,
    registered_count: result.registeredCount,
    skipped_count: result.skipped.length,
    candidate_core_count: result.candidateCoreCount ?? 0,
    skipped: result.skipped,
  });
}
