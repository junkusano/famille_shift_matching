import { NextRequest, NextResponse } from "next/server";
import { areSharefullAutomationCronsEnabled, testDeploymentCronSkippedResponse } from "@/lib/cron/testDeployment";
import { enqueueActiveSharefullTemplateCreationJobs, enqueueSharefullPublicationJobsForReadyTemplates } from "@/lib/spot-offer/enqueueSharefullPublicationJob";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * 対象利用者の全activeテンプレート作成と、ready_for_offer案件の掲載RPA指示を登録する。
 *
 * vercel.json から5分ごとに呼ばれるが、SHAREFULL_AUTO_POST_ENABLED=true の場合だけ、
 * 実際に rpa_runner_jobs へ登録する。Runner側のジョブ種別が掲載処理を決定する。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!areSharefullAutomationCronsEnabled()) {
    return NextResponse.json(testDeploymentCronSkippedResponse());
  }

  let templateCreation: Awaited<ReturnType<typeof enqueueActiveSharefullTemplateCreationJobs>>;
  try {
    templateCreation = await enqueueActiveSharefullTemplateCreationJobs("cron.open-sharefull-jobs");
  } catch {
    // Template creation discovery is independent from publication dispatch.
    // Keep the publication sweep running even if this phase has a transient
    // database error; the next cron will retry template discovery.
    templateCreation = {
      enabled: true,
      registeredCount: 0,
      skipped: ["テンプレート候補の取得に失敗しました。次回Cronで再確認します"],
      candidateTemplateCount: 0,
      failedTemplateCount: 1,
      registeredCoreIds: [],
      scope: "unknown",
    };
  }
  const result = await enqueueSharefullPublicationJobsForReadyTemplates("cron.open-sharefull-jobs");
  const hasFailures = templateCreation.failedTemplateCount > 0 || (result.failedCoreCount ?? 0) > 0;

  return NextResponse.json({
    ok: !hasFailures,
    enabled: result.enabled,
    registered_count: result.registeredCount,
    skipped_count: result.skipped.length,
    candidate_core_count: result.candidateCoreCount ?? 0,
    template_jobs_registered_count: templateCreation.registeredCount,
    template_candidate_count: templateCreation.candidateTemplateCount,
    template_skipped_count: templateCreation.skipped.length,
    template_failed_count: templateCreation.failedTemplateCount,
    template_scope: templateCreation.scope,
    publication_failed_core_count: result.failedCoreCount ?? 0,
    skipped: result.skipped,
    template_skipped: templateCreation.skipped,
  }, { status: hasFailures ? 500 : 200 });
}
