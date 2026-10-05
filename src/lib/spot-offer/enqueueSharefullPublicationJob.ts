import { providerSyncEnabled, validateSharefullSyncJob } from '@/lib/spot-sync/reconcile';
import { canRecruit } from '@/lib/spot-sync/policy';
import { isSharefullSyncClient, sharefullRequestTableName, sharefullRpaMode, sharefullSyncClientIds, sharefullSyncScopeLabel, sharefullTargetRunnerId, sharefullTemplateTableName } from '@/lib/spot-sync/sharefullScope';
import { supabaseAdmin } from "@/lib/supabase/service";
import { isDuplicateSharefullPublicationJob, SHAREFULL_PUBLICATION_DEDUPE_STATUSES } from "@/lib/spot-offer/publicationJobDedupe";
import { applySharefullContentPolicy } from "@/lib/spot-sync/sharefullContentPolicy";
import { recordSharefullContentPolicyBlock } from "@/lib/spot-sync/sharefullContentPolicyAlert";
import { latestSharefullTemplatesByClient } from "@/lib/spot-offer/latestSharefullTemplates";

const JOB_TYPE = "sharefull.create_spot_offer";
const TEMPLATE_JOB_TYPE = "sharefull.create_template";

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
    .from("rpa_runner_jobs").select("id").eq("job_type", TEMPLATE_JOB_TYPE)
    .eq("payload->>operation_key", operationKey)
    .in("status", ["pending", "claimed", "completed", "failed", "cancelled"]).limit(1);
  if (existingError) throw existingError;
  const alreadyQueued = Boolean(existing?.length);
  if (alreadyQueued) return { registeredCount: 0, skipped: ["テンプレート作成ジョブが登録済みです"] };
  const payload = { action: "create_sharefull_template", command: "create_template", core_id: coreId, operation_key: operationKey, sync_operation_key: operationKey, created_from: source };
  const { error } = await supabaseAdmin.from("rpa_runner_jobs").insert({ job_type: TEMPLATE_JOB_TYPE, status: "pending", payload, timeout_ms: 300_000, target_runner_id: sharefullTargetRunnerId() });
  if (error?.code === "23505") return { registeredCount: 0, skipped: ["テンプレート作成ジョブが登録済みです"] };
  if (error) throw error;
  return { registeredCount: 1, skipped: [] };
}

/**
 * 運用対象利用者ごとに最新の有効なMyFamilleテンプレートを1件選び、
 * Sharefull IDが未登録で安全確認を通ったものだけ作成ジョブへ登録する。
 * 全利用者化は既存の明示設定 SHAREFULL_SYNC_KAIPOKE_CS_IDS=* と
 * SHAREFULL_SYNC_ALLOW_ALL=true によって段階的に有効化できる。
 */
export async function enqueueLatestSharefullTemplateCreationJobs(source: string) {
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

  const latest = latestSharefullTemplatesByClient(rows);
  const { data: envRows, error: envError } = await supabaseAdmin
    .from("env_variables").select("key_name,value").eq("group_key", "sukima");
  if (envError) throw envError;
  const envValues = Object.fromEntries((envRows ?? []).map((row) => [row.key_name, row.value ?? ""]));
  const registeredCoreIds: string[] = [];
  const skipped: string[] = [];

  for (const template of latest) {
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
    if (policy.report.status === "blocked") {
      if (sharefullRpaMode() === "test") {
        await recordSharefullContentPolicyBlock({
          coreId,
          source,
          templateId: null,
          templateTitle: text(template.template_title) || null,
          sourceData: template,
          report: policy.report,
        });
      }
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
    candidateClientCount: latest.length,
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
  if (sharefullRpaMode() === "test" && templateRecord) {
    const policy = applySharefullContentPolicy(templateRecord);
    if (policy.report.status === "blocked") {
      const notification = await recordSharefullContentPolicyBlock({
        coreId,
        source,
        templateId: text(templateRecord.sharefull_template_id) || null,
        templateTitle: text(templateRecord.template_title) || null,
        sourceData: templateRecord,
        report: policy.report,
      });
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
    .in("status", [...SHAREFULL_PUBLICATION_DEDUPE_STATUSES])
    .limit(5000);
  if (existingError) throw existingError;

  const mode = executionMode();
  let registeredCount = 0;
  let duplicateJobCount = 0;
  const skipped: string[] = [];

  for (const row of requests ?? []) {
    const shiftId = text(row.shift_id);
    if (!shiftId) continue;
    const operationKey = `sharefull:create_spot_offer:${mode}:${shiftId}:${row.recruitment_revision ?? 0}`;
    if (!canRecruit(row)) continue;
    if (isDuplicateSharefullPublicationJob(
      (existing ?? []) as { status: string; payload: Record<string, unknown> | null }[],
      operationKey,
      text(row.id),
    )) {
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
      rpa_mode: sharefullRpaMode(),
      created_from: source,
    };
    if (providerSyncEnabled() && sharefullRpaMode() !== "test" && !await validateSharefullSyncJob(JOB_TYPE, payload)) continue;
    const { error } = await supabaseAdmin.from("rpa_runner_jobs").insert({ job_type: JOB_TYPE, status: "pending", payload, target_runner_id: sharefullTargetRunnerId() });
    if (error?.code === "23505") continue;
    if (error) throw error;
    const { error: statusError } = await supabaseAdmin
      .from(sharefullRequestTableName() as never)
      .update({ sharefull_status: "ready_for_offer", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("sharefull_status", "template_review")
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
