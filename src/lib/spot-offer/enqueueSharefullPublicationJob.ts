import { supabaseAdmin } from "@/lib/supabase/service";

const JOB_TYPE = "sharefull.create_spot_offer";
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

/**
 * 審査完了したテンプレートに紐づく未来のタイミー案件を、掲載RPAへ渡す。
 * 自動掲載フラグが無効な場合は何も登録しない（既存運用の安全策）。
 */
export async function enqueueSharefullPublicationJobsForTemplate(coreId: string, source: string) {
  if (!enabled()) return {
    enabled: false,
    registeredCount: 0,
    skipped: ["自動掲載が無効です"],
    diagnostic: { core_id: coreId, candidate_request_count: 0, duplicate_job_count: 0, registered_count: 0, skipped_count: 1 },
  };

  const { data: template, error: templateError } = await supabaseAdmin
    .from("spot_offer_template_unified")
    .select("core_id, sharefull_template_id, sharefull_template_status")
    .eq("core_id", coreId)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template || text(template.sharefull_template_status) !== "ready_for_offer") {
    return {
      enabled: true,
      registeredCount: 0,
      skipped: ["テンプレートが審査完了状態ではありません"],
      diagnostic: {
        core_id: coreId,
        template_status: text(template?.sharefull_template_status) || "missing",
        candidate_request_count: 0,
        duplicate_job_count: 0,
        registered_count: 0,
        skipped_count: 1,
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

  const today = new Date().toISOString().slice(0, 10);
  const { data: requests, error: requestError } = await supabaseAdmin
    .from("spot_offer_request_table")
    .select("id, core_id, shift_id, shift_start_date, shift_start_time, shift_end_time, unit_amount, commute_fee, status, taimee_job_id, sharefull_job_id, sharefull_status")
    .eq("core_id", coreId)
    .eq("status", "募集中")
    .gte("shift_start_date", today)
    .not("taimee_job_id", "is", null)
    .is("sharefull_job_id", null)
    .in("sharefull_status", ["template_review", "ready_for_offer"])
    .order("shift_start_date", { ascending: true })
    .order("shift_start_time", { ascending: true });
  if (requestError) throw requestError;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("rpa_runner_jobs")
    .select("payload")
    .eq("job_type", JOB_TYPE)
    .in("status", ACTIVE_STATUSES)
    .limit(5000);
  if (existingError) throw existingError;

  const mode = executionMode();
  const operationKeys = new Set(
    (existing ?? []).map((row) => text((row.payload as JsonRecord | null)?.operation_key)).filter(Boolean),
  );
  let registeredCount = 0;
  let duplicateJobCount = 0;
  const skipped: string[] = [];

  for (const row of requests ?? []) {
    const shiftId = text(row.shift_id);
    if (!shiftId) continue;
    const operationKey = `sharefull:create_spot_offer:${mode}:${shiftId}`;
    if (operationKeys.has(operationKey)) {
      duplicateJobCount += 1;
      skipped.push(`${shiftId}:同じジョブが登録済みです`);
      continue;
    }

    const payload = {
      action: "create_sharefull_job",
      command: "create_spot_offer",
      operation_key: operationKey,
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
      execution_mode: mode,
      created_from: source,
    };
    const { error } = await supabaseAdmin.from("rpa_runner_jobs").insert({ job_type: JOB_TYPE, status: "pending", payload });
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

  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error } = await supabaseAdmin
    .from("spot_offer_request_table")
    .select("core_id")
    .eq("status", "募集中")
    .gte("shift_start_date", today)
    .not("taimee_job_id", "is", null)
    .is("sharefull_job_id", null)
    .in("sharefull_status", ["template_review", "ready_for_offer"]);
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
  return { enabled: true, registeredCount, skipped, candidateCoreCount: coreIds.length, coreResults };
}
