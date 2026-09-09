import { providerSyncEnabled, validateSharefullSyncJob } from '@/lib/spot-sync/reconcile';
import { canRecruit } from '@/lib/spot-sync/policy';
import { isSharefullSyncClient, sharefullSyncClientIds, sharefullSyncScopeLabel } from '@/lib/spot-sync/sharefullScope';
import { supabaseAdmin } from "@/lib/supabase/service";

const JOB_TYPE = "sharefull.create_spot_offer";
const TEMPLATE_JOB_TYPE = "sharefull.create_template";
const ACTIVE_STATUSES = ["pending", "claimed", "completed"];

type JsonRecord = Record<string, unknown>;

type ReconciliationDiagnostic = {
  core_id: string;
  template_status?: string;
  candidate_request_count: number;
  duplicate_job_count: number;
  registered_count: number;
  skipped_count: number;
};

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function enabled(): boolean {
  return process.env.SHAREFULL_AUTO_POST_ENABLED?.trim().toLowerCase() === "true";
}

function executionMode(): "save" | "publish" {
  return process.env.SHAREFULL_AUTO_POST_MODE?.trim().toLowerCase() === "save" ? "save" : "publish";
}

function todayInJst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("/", "-");
}

async function enqueueSharefullTemplateCreationJob(coreId: string, source: string): Promise<{ registeredCount: number; skipped: string[] }> {
  const operationKey = `sharefull:create_template:${coreId}`;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("rpa_runner_jobs").select("payload").eq("job_type", TEMPLATE_JOB_TYPE).in("status", ["pending", "claimed"]).limit(5000);
  if (existingError) throw existingError;
  const alreadyQueued = (existing ?? []).some((row) => text((row.payload as JsonRecord | null)?.operation_key) === operationKey);
  if (alreadyQueued) return { registeredCount: 0, skipped: ["テンプレート作成ジョブが登録済みです"] };
  const payload = { action: "create_sharefull_template", command: "create_template", core_id: coreId, operation_key: operationKey, sync_operation_key: operationKey, created_from: source };
  const { error } = await supabaseAdmin.from("rpa_runner_jobs").insert({ job_type: TEMPLATE_JOB_TYPE, status: "pending", payload, timeout_ms: 300_000 });
  if (error?.code === "23505") return { registeredCount: 0, skipped: ["テンプレート作成ジョブが登録済みです"] };
  if (error) throw error;
  return { registeredCount: 1, skipped: [] };
}

/**
 * 審査完了したテンプレートに紐づく未来のタイミー案件を、掲載RPAへ渡す。
 * 自動掲載フラグが無効な場合は何も登録しない（既存運用の安全策）。
 */export async function enqueueSharefullPublicationJobsForTemplate(coreId: string, source: string) {
  if (!enabled()) return {
    enabled: false,
    registeredCount: 0,
    skipped: ["自動掲載が無効です"],
    diagnostic: { core_id: coreId, candidate_request_count: 0, duplicate_job_count: 0, registered_count: 0, skipped_count: 1 },
  };

  const { data: template, error: templateError } = await supabaseAdmin
    .from("spot_offer_template_unified")
    .select("core_id, kaipoke_cs_id, sharefull_template_id, sharefull_template_status")
    .eq("core_id", coreId)
    .maybeSingle();
  if (templateError) throw templateError;
  if (template && !isSharefullSyncClient(template.kaipoke_cs_id)) {
    return {
      enabled: true,
      registeredCount: 0,
      skipped: ["検証対象外の利用者です"],
      diagnostic: { core_id: coreId, candidate_request_count: 0, duplicate_job_count: 0, registered_count: 0, skipped_count: 1 },
    };
  }
  if (!template || text(template.sharefull_template_status) !== "ready_for_offer") {
    const canCreateTemplate = Boolean(template && !text(template.sharefull_template_id));
    const templateJob = canCreateTemplate
      ? await enqueueSharefullTemplateCreationJob(coreId, source)
      : { registeredCount: 0, skipped: ["テンプレートが審査完了状態ではありません"] };
    return {
      enabled: true,
      registeredCount: templateJob.registeredCount,
      skipped: templateJob.skipped,
      diagnostic: {
        core_id: coreId,
        template_status: text(template?.sharefull_template_status) || "missing",
        candidate_request_count: 0,
        duplicate_job_count: 0,
        registered_count: templateJob.registeredCount,
        skipped_count: templateJob.skipped.length,
      },
    };
  }
  const sharefullTemplateId = text(template.sharefull_template_id);
  if (!sharefullTemplateId) return {
    enabled: true,
    registeredCount: 0,
    skipped: ["SharefullテンプレートIDがありません"],
    diagnostic: { core_id: coreId, template_status: "ready_for_offer", candidate_request_count: 0, duplicate_job_count: 0, registered_count: 0, skipped_count: 1 },
  };

  const today = todayInJst();
  let requestQuery = supabaseAdmin
    .from("spot_offer_request_table")
    .select("id, core_id, kaipoke_cs_id, shift_id, shift_start_date, shift_start_time, shift_end_time, unit_amount, commute_fee, status, taimee_job_id, sharefull_job_id, sharefull_status, recruitment_revision")
    .eq("core_id", coreId)
    .eq("status", "募集中")
    .gte("shift_start_date", today)
    .not("taimee_job_id", "is", null)
    .is("sharefull_job_id", null)
    .or("sharefull_status.is.null,sharefull_status.in.(template_review,ready_for_offer)")
    .order("shift_start_date", { ascending: true })
    .order("shift_start_time", { ascending: true });
  const scopeClientIds = sharefullSyncClientIds();
  if (scopeClientIds !== null) requestQuery = requestQuery.in("kaipoke_cs_id", scopeClientIds);
  const { data: requests, error: requestError } = await requestQuery;
  if (requestError) throw requestError;

  const shiftIds = (requests ?? [])
    .map((row) => row.shift_id)
    .filter((shiftId): shiftId is number => typeof shiftId === "number");
  const { data: shifts, error: shiftError } = shiftIds.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("shift").select("shift_id, required_staff_count").in("shift_id", shiftIds);
  if (shiftError) throw shiftError;
  const requiredStaffCountByShiftId = new Map(
    (shifts ?? []).map((shift) => [shift.shift_id, shift.required_staff_count]),
  );

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("rpa_runner_jobs")
    .select("payload,status")
    .eq("job_type", JOB_TYPE)
    .in("status", ACTIVE_STATUSES)
    .limit(5000);
  if (existingError) throw existingError;

  const mode = executionMode();
  const operationKeys = new Set(
    (existing ?? []).map((row) => text((row.payload as JsonRecord | null)?.operation_key)).filter(Boolean),
  );
  const pendingRequests = new Set((existing ?? []).filter(row => ['pending','claimed'].includes(row.status))
    .map(row => text((row.payload as JsonRecord | null)?.spot_offer_request_id)).filter(Boolean));
  let registeredCount = 0;
  let duplicateJobCount = 0;
  const skipped: string[] = [];

  for (const row of requests ?? []) {
    const shiftId = text(row.shift_id);
    if (!shiftId) continue;
    const operationKey = `sharefull:create_spot_offer:${mode}:${shiftId}:${row.recruitment_revision ?? 0}`;
    if (!canRecruit(row)) continue;
    if (operationKeys.has(operationKey) || pendingRequests.has(text(row.id))) {
      duplicateJobCount += 1;
      skipped.push(`${shiftId}:同じジョブが登録済みです`);
      continue;
    }

    const payload = {
      action: "create_sharefull_job",
      command: "create_spot_offer",
      operation_key: operationKey,
      sync_operation_key: operationKey,
      spot_offer_request_id: row.id,
      shift_id: row.shift_id,
      core_id: row.core_id,
      taimee_job_id: row.taimee_job_id,
      sharefull_template_id: sharefullTemplateId,
      shift_start_date: row.shift_start_date,
      shift_start_time: row.shift_start_time,
      shift_end_time: row.shift_end_time,
      hourly_wage: row.unit_amount,
      commute_fee: row.commute_fee,
      headcount: requiredStaffCountByShiftId.get(row.shift_id) ?? 1,
      execution_mode: mode,
      created_from: source,
    };
    if (providerSyncEnabled() && !await validateSharefullSyncJob(JOB_TYPE, payload)) continue;
    const { error } = await supabaseAdmin.from("rpa_runner_jobs").insert({ job_type: JOB_TYPE, status: "pending", payload });
    if (error?.code === "23505") continue;
    if (error) throw error;
    const { error: statusError } = await supabaseAdmin
      .from("spot_offer_request_table")
      .update({ sharefull_status: "ready_for_offer", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("sharefull_status", "template_review")
      .is("sharefull_job_id", null);
    if (statusError) throw statusError;
    operationKeys.add(operationKey);
    registeredCount += 1;
  }

  return {
    enabled: true,
    registeredCount,
    skipped,
    diagnostic: {
      core_id: coreId,
      template_status: "ready_for_offer",
      candidate_request_count: (requests ?? []).length,
      duplicate_job_count: duplicateJobCount,
      registered_count: registeredCount,
      skipped_count: skipped.length,
    },
  };
}

/**
 * 審査完了済みの全テンプレートを対象に掲載ジョブを登録する。
 * Cronはこの関数だけを呼び出し、審査完了通知時の即時登録と同じ判定を使う。
 */
export async function enqueueSharefullPublicationJobsForReadyTemplates(source: string) {
  if (!enabled()) return { enabled: false, registeredCount: 0, skipped: ["自動掲載が無効です"] };

  const today = todayInJst();
  let query = supabaseAdmin
    .from("spot_offer_request_table")
    .select("core_id, kaipoke_cs_id")
    .eq("status", "募集中")
    .gte("shift_start_date", today)
    .not("taimee_job_id", "is", null)
    .is("sharefull_job_id", null)
    .or("sharefull_status.is.null,sharefull_status.in.(template_review,ready_for_offer)");
  const scopeClientIds = sharefullSyncClientIds();
  if (scopeClientIds !== null) query = query.in("kaipoke_cs_id", scopeClientIds);
  const { data: rows, error } = await query;
  if (error) throw error;

  const coreIds = Array.from(new Set((rows ?? []).map((row) => text(row.core_id)).filter(Boolean)));
  let registeredCount = 0;
  const skipped: string[] = [];
  const coreResults: ReconciliationDiagnostic[] = [];
  for (const coreId of coreIds) {
    const result = await enqueueSharefullPublicationJobsForTemplate(coreId, source);
    registeredCount += result.registeredCount;
    skipped.push(...result.skipped.map((reason) => `${coreId}: ${reason}`));
    if (result.diagnostic) coreResults.push(result.diagnostic);
  }
  return { enabled: true, registeredCount, skipped, candidateCoreCount: coreIds.length, coreResults, scope: sharefullSyncScopeLabel() };
}
