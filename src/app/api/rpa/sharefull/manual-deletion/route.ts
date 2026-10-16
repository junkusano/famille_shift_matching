import { NextRequest, NextResponse } from "next/server";
import { requireRpaAuthenticatedUser, requireTaimeeRpaOperator, isRpaTaimeeError } from "@/lib/rpa/taimee";
import { supabaseAdmin } from "@/lib/supabase/service";
import { providerSyncEnabled, validateSharefullSyncJob } from "@/lib/spot-sync/reconcile";
import { isSharefullSyncClient, sharefullRpaMode } from "@/lib/spot-sync/sharefullScope";

export const dynamic = "force-dynamic";

function todayInJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).replaceAll("/", "-");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireProductionRecoveryEnabled(): void {
  if (sharefullRpaMode() !== "production") throw Object.assign(new Error("本番Sharefull設定でのみ利用できます"), { status: 409 });
  if (process.env.SHAREFULL_AUTO_POST_ENABLED?.trim().toLowerCase() !== "true") {
    throw Object.assign(new Error("Sharefull自動掲載が無効です"), { status: 409 });
  }
  if (!providerSyncEnabled()) throw Object.assign(new Error("Sharefull掲載時の応募・シフト再確認が無効です"), { status: 409 });
  if (process.env.SHAREFULL_AUTO_POST_MODE?.trim().toLowerCase() === "save") {
    throw Object.assign(new Error("現在のSharefull設定は保存モードです。公開ジョブは登録できません"), { status: 409 });
  }
}

function errorResponse(error: unknown): NextResponse {
  if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
  const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 500;
  if (status !== 500) return NextResponse.json({ error: error instanceof Error ? error.message : "再投入できません" }, { status });
  console.error("[rpa/sharefull/manual-deletion] failed", error);
  return NextResponse.json({ error: "手動削除の記録または再投入に失敗しました" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    requireProductionRecoveryEnabled();

    const { data: requests, error: requestError } = await supabaseAdmin
      .from("spot_offer_request_table")
      .select("id,core_id,kaipoke_cs_id,shift_id,shift_start_date,shift_start_time,shift_end_time,unit_amount,commute_fee,status,template_title,sharefull_job_id,sharefull_status")
      .eq("status", "募集中")
      .eq("sharefull_status", "ready_for_offer")
      .is("sharefull_job_id", null)
      .gte("shift_start_date", todayInJst())
      .order("shift_start_date", { ascending: true })
      .order("shift_start_time", { ascending: true })
      .limit(500);
    if (requestError) throw requestError;

    const eligible = (requests ?? []).filter((row) => isSharefullSyncClient(row.kaipoke_cs_id));
    if (eligible.length === 0) {
      const { data: audits, error: auditError } = await supabaseAdmin
        .from("sharefull_manual_deletion_audits")
        .select("id,request_id,sharefull_job_id,sharefull_order_id,confirmed_by,confirmed_at,reason,requeue_job_id")
        .order("confirmed_at", { ascending: false })
        .limit(20);
      if (auditError) throw auditError;
      return NextResponse.json({ ok: true, candidates: [], audits: audits ?? [] });
    }
    const requestIds = eligible.map((row) => row.id);
    const coreIds = [...new Set(eligible.map((row) => row.core_id))];
    const [templatesResult, jobsResult, auditsResult] = await Promise.all([
      supabaseAdmin.from("spot_offer_template_unified")
        .select("core_id,sharefull_template_id,sharefull_template_status")
        .in("core_id", coreIds),
      supabaseAdmin.from("rpa_runner_jobs")
        .select("id,status,error_message,created_at,payload")
        .eq("job_type", "sharefull.create_spot_offer")
        .in("status", ["pending", "claimed", "failed"])
        .in("payload->>spot_offer_request_id", requestIds)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("sharefull_manual_deletion_audits")
        .select("id,request_id,sharefull_job_id,sharefull_order_id,confirmed_by,confirmed_at,reason,requeue_job_id")
        .in("request_id", requestIds),
    ]);
    if (templatesResult.error) throw templatesResult.error;
    if (jobsResult.error) throw jobsResult.error;
    if (auditsResult.error) throw auditsResult.error;

    const templates = new Map((templatesResult.data ?? []).map((row) => [row.core_id, row]));
    const jobs = jobsResult.data ?? [];
    const latestAuditAt = new Map<string, number>();
    for (const audit of auditsResult.data ?? []) {
      const confirmedAt = Date.parse(audit.confirmed_at);
      if (Number.isFinite(confirmedAt)) latestAuditAt.set(audit.request_id, Math.max(latestAuditAt.get(audit.request_id) ?? 0, confirmedAt));
    }
    const candidates = eligible.flatMap((row) => {
      const template = templates.get(row.core_id);
      if (!template || template.sharefull_template_status !== "ready_for_offer" || !template.sharefull_template_id) return [];
      const related = jobs.filter((job) => (job.payload as Record<string, unknown> | null)?.spot_offer_request_id === row.id);
      const lastAuditAt = latestAuditAt.get(row.id) ?? 0;
      const latestFailure = related.find((job) => job.status === "failed" && Date.parse(job.created_at) > lastAuditAt);
      const hasFailedAttempt = !!latestFailure;
      const hasActiveAttempt = related.some((job) => job.status === "pending" || job.status === "claimed");
      if (!hasFailedAttempt || hasActiveAttempt) return [];
      return [{
        request_id: row.id,
        shift_id: row.shift_id,
        date: row.shift_start_date,
        start_time: row.shift_start_time,
        end_time: row.shift_end_time,
        title: row.template_title,
        template_id: template.sharefull_template_id,
        failed_job_id: latestFailure?.id ?? null,
        failed_at: latestFailure?.created_at ?? null,
        failure_summary: latestFailure?.error_message ?? null,
      }];
    });

    const { data: recentAudits, error: recentAuditsError } = await supabaseAdmin
      .from("sharefull_manual_deletion_audits")
      .select("id,request_id,sharefull_job_id,sharefull_order_id,confirmed_by,confirmed_at,reason,requeue_job_id")
      .order("confirmed_at", { ascending: false })
      .limit(20);
    if (recentAuditsError) throw recentAuditsError;
    return NextResponse.json({ ok: true, candidates, audits: recentAudits ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    requireProductionRecoveryEnabled();
    const confirmedBy = await requireRpaAuthenticatedUser(request);
    const body = await request.json() as Record<string, unknown>;
    const requestId = text(body.request_id);
    const sharefullJobId = text(body.sharefull_job_id);
    const sharefullOrderId = text(body.sharefull_order_id) || null;
    const reason = text(body.reason);
    if (!/^[0-9a-f-]{36}$/i.test(requestId)
      || !/^[1-9]\d{3,}$/.test(sharefullJobId)
      || (sharefullOrderId !== null && !/^[1-9]\d{3,}$/.test(sharefullOrderId))
      || body.confirm_deleted !== true
      || reason.length < 1 || reason.length > 500) {
      return NextResponse.json({ error: "対象・削除済み求人ID・確認理由を正しく入力してください" }, { status: 400 });
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("spot_offer_request_table")
      .select("id,core_id,kaipoke_cs_id,shift_id,shift_start_date,shift_start_time,shift_end_time,unit_amount,commute_fee,status,taimee_job_id,sharefull_job_id,sharefull_status")
      .eq("id", requestId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target || !isSharefullSyncClient(target.kaipoke_cs_id)) {
      return NextResponse.json({ error: "対象案件が見つからないか、連携対象外です" }, { status: 404 });
    }
    const { data: template, error: templateError } = await supabaseAdmin
      .from("spot_offer_template_unified")
      .select("sharefull_template_id")
      .eq("core_id", target.core_id)
      .eq("sharefull_template_status", "ready_for_offer")
      .maybeSingle();
    if (templateError) throw templateError;
    if (!template?.sharefull_template_id) return NextResponse.json({ error: "審査完了済みテンプレートを確認できません" }, { status: 409 });

    const payload = {
      action: "create_sharefull_job",
      command: "create_spot_offer",
      spot_offer_request_id: target.id,
      shift_id: target.shift_id,
      core_id: target.core_id,
      sharefull_template_id: template.sharefull_template_id,
      shift_start_date: target.shift_start_date,
      shift_start_time: target.shift_start_time,
      shift_end_time: target.shift_end_time,
      execution_mode: "publish",
    };
    if (!await validateSharefullSyncJob("sharefull.create_spot_offer", payload)) {
      return NextResponse.json({ error: "現在の応募・シフト状態では再投入できません" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin.rpc("confirm_sharefull_manual_deletion_and_requeue", {
      p_request_id: requestId,
      p_sharefull_job_id: sharefullJobId,
      p_sharefull_order_id: sharefullOrderId,
      p_confirmed_by: confirmedBy,
      p_reason: reason,
    });
    if (error) {
      const conflict = /別の掲載記録|実行中|状態|再照合が必要な失敗|テンプレート|応募・決定|勤務日時/.test(error.message);
      return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 500 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
