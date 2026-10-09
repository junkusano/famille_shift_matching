import { providerSyncEnabled, validateSharefullSyncJob } from '@/lib/spot-sync/reconcile';
import { canRecruit } from '@/lib/spot-sync/policy';
import { isSharefullSyncClient, sharefullRequestTableName, sharefullRpaMode, sharefullSyncClientIds, sharefullSyncScopeLabel, sharefullTargetRunnerId, sharefullTemplateTableName } from '@/lib/spot-sync/sharefullScope';
import { supabaseAdmin } from "@/lib/supabase/service";
import { SHAREFULL_PUBLICATION_DEDUPE_STATUSES } from "@/lib/spot-offer/publicationJobDedupe";
import { applySharefullContentPolicy } from "@/lib/spot-sync/sharefullContentPolicy";
import { recordSharefullContentPolicyBlock } from "@/lib/spot-sync/sharefullContentPolicyAlert";
import { activeSharefullTemplates } from "@/lib/spot-offer/latestSharefullTemplates";

const JOB_TYPE = "sharefull.create_spot_offer";
const TEMPLATE_JOB_TYPE = "sharefull.create_template";
const TEMPLATE_JOB_RETRY_COOLDOWN_MS = 60 * 60 * 1000;
const TEMPLATE_JOB_MAX_ATTEMPTS = 3;
const PUBLICATION_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const PUBLICATION_MAX_ATTEMPTS = 3;
// These failures are recorded before a Sharefull page action can start. Other
// failures may have happened after the publish button was clicked, so retrying
// them automatically could create a duplicate listing.
const SAFE_PUBLICATION_RETRY_CATEGORIES = new Set(["CONFIGURATION", "LOGIN_REQUIRED"]);

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
  const baseOperationKey = `sharefull:create_template:${coreId}`;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("rpa_runner_jobs").select("id,status,created_at,updated_at,error_code,error_type,error_category,error_message,payload").eq("job_type", TEMPLATE_JOB_TYPE)
    .eq("payload->>core_id", coreId).order("created_at", { ascending: false });
  if (existingError) throw existingError;
  const attempts = (existing ?? []).filter((job) => {
    const payload = job.payload as Record<string, unknown> | null;
    const key = text(payload?.operation_key);
    return key === baseOperationKey || key.startsWith(`${baseOperationKey}:retry:`);
  });
  if (attempts.some((job) => ["pending", "claimed", "running", "completed"].includes(text(job.status)))) {
    return { registeredCount: 0, skipped: ["テンプレート作成ジョブが登録済みです"] };
  }
  if (attempts.some((job) => isAmbiguousSharefullTemplateFailure(job))) {
    return { registeredCount: 0, skipped: ["Sharefull側の作成有無を照合するまで再投入を保留しています"] };
  }
  const latestAttempt = attempts[0];
  if (latestAttempt) {
    if (text(latestAttempt.status) !== "failed") {
      return { registeredCount: 0, skipped: ["テンプレート作成ジョブがキャンセルされています"] };
    }
    if (attempts.length >= TEMPLATE_JOB_MAX_ATTEMPTS) {
      return { registeredCount: 0, skipped: ["テンプレート作成ジョブの自動再試行上限に達しました"] };
    }
    const failedAt = Date.parse(text(latestAttempt.updated_at) || text(latestAttempt.created_at));
    if (!Number.isFinite(failedAt) || Date.now() - failedAt < TEMPLATE_JOB_RETRY_COOLDOWN_MS) {
      return { registeredCount: 0, skipped: ["テンプレート作成ジョブの再試行待ちです"] };
    }
  }
  const operationKey = attempts.length === 0
    ? baseOperationKey
    : `${baseOperationKey}:retry:${attempts.length}`;
  const payload = { action: "create_sharefull_template", command: "create_template", core_id: coreId, operation_key: operationKey, sync_operation_key: operationKey, created_from: source };
  const { error } = await supabaseAdmin.from("rpa_runner_jobs").insert({ job_type: TEMPLATE_JOB_TYPE, status: "pending", payload, timeout_ms: 300_000, target_runner_id: sharefullTargetRunnerId() });
  if (error?.code === "23505") return { registeredCount: 0, skipped: ["テンプレート作成ジョブが登録済みです"] };
  if (error) throw error;
  return { registeredCount: 1, skipped: [] };
}

function isAmbiguousSharefullTemplateFailure(job: JsonRecord): boolean {
  const values = [job.error_code, job.error_type, job.error_category, job.error_message]
    .map((value) => text(value).toLowerCase());
  return values.some((value) => value === "job_timeout"
    || value === "timeout"
    || value.includes("timeout")
    || value.includes("timed out")
    || value.includes("作成済み・id未記録")
    || value.includes("id保存失敗"));
}

/**
 * 運用対象利用者の全ての有効なMyFamilleテンプレートを選び、
 * Sharefull IDが未登録で安全確認を通ったものだけ作成ジョブへ登録する。
 * 全利用者化は既存の明示設定 SHAREFULL_SYNC_KAIPOKE_CS_IDS=* と
 * SHAREFULL_SYNC_ALLOW_ALL=true によって段階的に有効化できる。
 */
export async function enqueueActiveSharefullTemplateCreationJobs(source: string) {
  const targetClientIds = sharefullSyncClientIds();
  let query = supabaseAdmin.from(sharefullTemplateTableName() as never)
    .select("*")
    .eq("status", "active")
    .not("kaipoke_cs_id", "is", null)
    .order("updated_at", { ascending: false });
  if (targetClientIds !== null) query = query.in("kaipoke_cs_id", targetClientIds);

  const rows: JsonRecord[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as JsonRecord[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const templates = activeSharefullTemplates(rows);
  const { data: envRows, error: envError } = await supabaseAdmin
    .from("env_variables").select("key_name,value").eq("group_key", "sukima");
  if (envError) throw envError;
  const envValues = Object.fromEntries((envRows ?? []).map((row) => [row.key_name, row.value ?? ""]));
  const registeredCoreIds: string[] = [];
  const skipped: string[] = [];

  for (const template of templates) {
    const coreId = text(template.core_id);
    if (text(template.sharefull_template_id)) {
      skipped.push(`${coreId}:既にSharefullテンプレートIDがあります`);
      continue;
    }

    const policy = applySharefullContentPolicy({
      ...template,
      env: {
        sukima_detail: text(envValues.sukima_detail),
        sukima_automsg: text(envValues.sukima_automsg),
        sukima_koudou: text(envValues.sukima_koudou),
        sukima_caution: text(envValues.sukima_caution),
      },
    });
    if (policy.report.findings.length > 0) {
      await recordSharefullContentPolicyBlock({
        coreId,
        source,
        templateId: null,
        templateTitle: text(template.template_title) || null,
        sourceData: template,
        report: policy.report,
      });
    }
    if (policy.report.status === "blocked") {
      console.warn("[sharefull/template-auto-create] blocked by content policy", {
        finding_count: policy.report.findings.length,
      });
      skipped.push(`${coreId}:要確認文言を検出しました`);
      continue;
    }

    const result = await enqueueSharefullTemplateCreationJob(coreId, source);
    if (result.registeredCount > 0) registeredCoreIds.push(coreId);
    skipped.push(...result.skipped.map((reason) => `${coreId}:${reason}`));
  }

  return {
    enabled: true,
    registeredCount: registeredCoreIds.length,
    skipped,
    candidateTemplateCount: templates.length,
    registeredCoreIds,
    scope: sharefullSyncScopeLabel(),
  };
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
    .from(sharefullTemplateTableName() as never)
    .select("core_id, kaipoke_cs_id, sharefull_template_id, sharefull_template_status, template_title, work_description, cautions, auto_message, matching_msg, internal_label")
    .eq("core_id", coreId)
    .maybeSingle();
  if (templateError) throw templateError;
  const templateRecord = template as unknown as JsonRecord | null;
  if (templateRecord && !isSharefullSyncClient(templateRecord.kaipoke_cs_id)) {
    return {
      enabled: true,
      registeredCount: 0,
      skipped: ["検証対象外の利用者です"],
      diagnostic: { core_id: coreId, candidate_request_count: 0, duplicate_job_count: 0, registered_count: 0, skipped_count: 1 },
    };
  }
  if (templateRecord) {
    const policy = applySharefullContentPolicy(templateRecord);
    if (policy.report.findings.length > 0) {
      const notification = await recordSharefullContentPolicyBlock({
        coreId,
        source,
        templateId: text(templateRecord.sharefull_template_id) || null,
        templateTitle: text(templateRecord.template_title) || null,
        sourceData: templateRecord,
        report: policy.report,
      });
      if (policy.report.status === "blocked") {
        return {
          enabled: true,
          registeredCount: 0,
          skipped: [notification.notified ? "公開本文の事前検査で停止しました" : "公開本文の事前検査で停止しました（LINE WORKS通知失敗）"],
          diagnostic: { core_id: coreId, template_status: text(templateRecord.sharefull_template_status) || "missing", candidate_request_count: 0, duplicate_job_count: 0, registered_count: 0, skipped_count: 1 },
          contentPolicy: policy.report,
          notification,
        };
      }
    }
  }

  if (!templateRecord || text(templateRecord.sharefull_template_status) !== "ready_for_offer") {
    const canCreateTemplate = Boolean(templateRecord && !text(templateRecord.sharefull_template_id));
    const templateJob = canCreateTemplate
      ? await enqueueSharefullTemplateCreationJob(coreId, source)
      : { registeredCount: 0, skipped: ["テンプレートが審査完了状態ではありません"] };
    return {
      enabled: true,
      registeredCount: templateJob.registeredCount,
      skipped: templateJob.skipped,
      diagnostic: {
        core_id: coreId,
        template_status: text(templateRecord?.sharefull_template_status) || "missing",
        candidate_request_count: 0,
        duplicate_job_count: 0,
        registered_count: templateJob.registeredCount,
        skipped_count: templateJob.skipped.length,
      },
    };
  }
  const sharefullTemplateId = text(templateRecord.sharefull_template_id);
  if (!sharefullTemplateId) return {
    enabled: true,
    registeredCount: 0,
    skipped: ["SharefullテンプレートIDがありません"],
    diagnostic: { core_id: coreId, template_status: "ready_for_offer", candidate_request_count: 0, duplicate_job_count: 0, registered_count: 0, skipped_count: 1 },
  };

  const today = todayInJst();
  let requestQuery = supabaseAdmin
    .from(sharefullRequestTableName() as never)
    .select("id, core_id, kaipoke_cs_id, shift_id, shift_start_date, shift_start_time, shift_end_time, unit_amount, commute_fee, status, taimee_job_id, sharefull_job_id, sharefull_status, recruitment_revision")
    .eq("core_id", coreId)
    .eq("status", "募集中")
    .gte("shift_start_date", today)
    .not("taimee_job_id", "is", null)
    .is("sharefull_job_id", null)
    .or("sharefull_status.is.null,sharefull_status.in.(template_review,ready_for_offer)")
    .order("shift_start_date", { ascending: true })
    .order("shift_start_time", { ascending: true })
    .order("id", { ascending: true });
  const scopeClientIds = sharefullSyncClientIds();
  if (scopeClientIds !== null) requestQuery = requestQuery.in("kaipoke_cs_id", scopeClientIds);
  const requests: JsonRecord[] = [];
  const requestPageSize = 500;
  for (let offset = 0; ; offset += requestPageSize) {
    const { data, error } = await requestQuery.range(offset, offset + requestPageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as JsonRecord[];
    requests.push(...page);
    if (page.length < requestPageSize) break;
  }

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

  const existing: Array<{ id: string; payload: Record<string, unknown> | null; status: string; error_category: string | null; error_code: string | null; failed_at: string | null; claimed_at: string | null; claimed_runner_id: string | null; timeout_ms: number | null }> = [];
  const jobPageSize = 500;
  for (let offset = 0; ; offset += jobPageSize) {
    const { data, error } = await supabaseAdmin
      .from("rpa_runner_jobs")
      .select("id,payload,status,error_category,error_code,failed_at,claimed_at,claimed_runner_id,timeout_ms")
      .eq("job_type", JOB_TYPE)
      .in("status", [...SHAREFULL_PUBLICATION_DEDUPE_STATUSES])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + jobPageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as typeof existing;
    existing.push(...page);
    if (page.length < jobPageSize) break;
  }

  const mode = executionMode();
  let registeredCount = 0;
  let duplicateJobCount = 0;
  const skipped: string[] = [];

  for (const row of requests ?? []) {
    const shiftId = text(row.shift_id);
    if (!shiftId) continue;
    const baseOperationKey = `sharefull:create_spot_offer:${mode}:${shiftId}:${row.recruitment_revision ?? 0}`;
    if (!canRecruit(row)) continue;
    const requestJobs = existing.filter((job) => text(job.payload?.spot_offer_request_id) === text(row.id));
    const sameOperationJobs = requestJobs.filter((job) => {
      const key = text(job.payload?.operation_key);
      return key === baseOperationKey || key.startsWith(`${baseOperationKey}:retry:`);
    });
    const failedJobs = sameOperationJobs.filter((job) => job.status === "failed");
    const cancelledJobs = sameOperationJobs.filter((job) => job.status === "cancelled");
    const latestFailure = failedJobs.sort((a, b) => Date.parse(text(b.failed_at)) - Date.parse(text(a.failed_at)))[0];
    const staleClaimedJobs = sameOperationJobs.filter((job) => {
      if (job.status !== "claimed") return false;
      const claimedAt = Date.parse(text(job.claimed_at));
      // Runner retries can consume three job timeouts; allow a further two minutes for completion reporting.
      const staleAfterMs = Math.max((job.timeout_ms ?? 300_000) * 3 + 120_000, 15 * 60_000);
      return Number.isFinite(claimedAt) && Date.now() - claimedAt >= staleAfterMs;
    });
    const latestStaleClaim = staleClaimedJobs.sort((a, b) => Date.parse(text(b.claimed_at)) - Date.parse(text(a.claimed_at)))[0];
    const reconciliationSource = latestFailure ?? latestStaleClaim;
    const sourceOperationKey = text(reconciliationSource?.payload?.operation_key);
    const retryIndex = /:retry:(\d+)$/.exec(sourceOperationKey);
    const attemptCount = reconciliationSource ? (retryIndex ? Number(retryIndex[1]) + 1 : 1) : 0;
    const sourceAt = Date.parse(text(latestFailure?.failed_at ?? latestStaleClaim?.claimed_at));
    const hasUnsafeFailure = failedJobs.some((job) => !SAFE_PUBLICATION_RETRY_CATEGORIES.has(text(job.error_category).toUpperCase()));
    const hasReconciliationAttempt = sameOperationJobs.some((job) => job.payload?.reconcile_only === true);
    const failureCooldownElapsed = Number.isFinite(sourceAt) && Date.now() - sourceAt >= PUBLICATION_RETRY_COOLDOWN_MS;
    const safeToRetry = Boolean(latestFailure && !hasUnsafeFailure
      && SAFE_PUBLICATION_RETRY_CATEGORIES.has(text(latestFailure.error_category).toUpperCase())
      && attemptCount < PUBLICATION_MAX_ATTEMPTS
      && failureCooldownElapsed);
    const reconcileOnly = Boolean(reconciliationSource && (hasUnsafeFailure || latestStaleClaim)
      && !hasReconciliationAttempt
      && attemptCount < PUBLICATION_MAX_ATTEMPTS && failureCooldownElapsed);
    const activeOrCompleted = sameOperationJobs.some((job) => job.status === "completed"
      || job.status === "pending"
      || (job.status === "claimed" && !staleClaimedJobs.includes(job)));
    const retryBlocked = failedJobs.length > 0 && !safeToRetry && !reconcileOnly
      || (cancelledJobs.length > 0 && failedJobs.length === 0);
    if (activeOrCompleted || (retryBlocked && !reconcileOnly)) {
      duplicateJobCount += 1;
      skipped.push(`${shiftId}:${hasUnsafeFailure ? "掲載結果の照合が必要な失敗ジョブがあります" : "同じジョブが登録済み、または再試行待ちです"}`);
      continue;
    }
    const operationKey = safeToRetry || reconcileOnly
      ? `${baseOperationKey}:retry:${attemptCount}`
      : cancelledJobs.length > 0
        ? `${baseOperationKey}:retry:${cancelledJobs.length}`
        : baseOperationKey;

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
      rpa_mode: sharefullRpaMode(),
      ...(reconcileOnly ? {
        reconcile_only: true,
        reconcile_for_operation_key: baseOperationKey,
        reconcile_of_job_id: reconciliationSource!.id,
      } : {}),
      created_from: source,
    };
    if (providerSyncEnabled() && sharefullRpaMode() !== "test" && !await validateSharefullSyncJob(JOB_TYPE, payload)) continue;
    const { error } = await supabaseAdmin.from("rpa_runner_jobs").insert({
      job_type: JOB_TYPE,
      status: "pending",
      payload,
      target_runner_id: reconcileOnly ? reconciliationSource?.claimed_runner_id ?? null : sharefullTargetRunnerId(),
    });
    if (error?.code === "23505") continue;
    if (error) throw error;
    const { error: statusError } = await supabaseAdmin
      .from(sharefullRequestTableName() as never)
      .update({ sharefull_status: "ready_for_offer", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .in("sharefull_status", ["template_review", "ready_for_offer"])
      .is("sharefull_job_id", null);
    if (statusError) throw statusError;
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
    .from(sharefullRequestTableName() as never)
    .select("id, core_id, kaipoke_cs_id")
    .eq("status", "募集中")
    .gte("shift_start_date", today)
    .not("taimee_job_id", "is", null)
    .is("sharefull_job_id", null)
    .or("sharefull_status.is.null,sharefull_status.in.(template_review,ready_for_offer)");
  const scopeClientIds = sharefullSyncClientIds();
  if (scopeClientIds !== null) query = query.in("kaipoke_cs_id", scopeClientIds);
  const rows: Array<{ id: string; core_id: string | null; kaipoke_cs_id: string | null }> = [];
  query = query.order("id", { ascending: true });
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const coreIds = Array.from(new Set(rows.map((row) => text(row.core_id)).filter(Boolean)));
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
