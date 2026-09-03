import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ACTIVE_RUNNER_STATUSES = ["pending", "claimed"];
const SHAREFULL_JOB_TYPE = "sharefull.create_spot_offer";
const SHAREFULL_EXECUTION_MODES = ["save", "publish"] as const;
type SharefullExecutionMode = (typeof SHAREFULL_EXECUTION_MODES)[number];

type JsonRecord = Record<string, unknown>;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEnabled(): boolean {
  return process.env.SHAREFULL_AUTO_POST_ENABLED?.trim().toLowerCase() === "true";
}

function executionMode(): SharefullExecutionMode {
  return process.env.SHAREFULL_AUTO_POST_MODE?.trim().toLowerCase() === "publish" ? "publish" : "save";
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

  const mode = executionMode();

  if (!isEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      registered_count: 0,
      message: "Sharefull自動掲載は無効です",
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error: requestError } = await supabaseAdmin
    .from("spot_offer_request_table")
    .select(
      "id, core_id, shift_id, shift_start_date, shift_start_time, shift_end_time, unit_amount, commute_fee, status, taimee_job_id, sharefull_job_id, sharefull_status"
    )
    .eq("status", "募集中")
    .in("sharefull_status", ["template_review", "ready_for_offer"])
    .is("sharefull_job_id", null)
    .gte("shift_start_date", today)
    .not("taimee_job_id", "is", null)
    .order("shift_start_date", { ascending: true })
    .order("shift_start_time", { ascending: true });

  if (requestError) throw requestError;

  const candidates = (rows ?? []).filter((row) =>
    text(row.taimee_job_id) && !text(row.sharefull_job_id) && text(row.shift_id)
  );
  const coreIds = Array.from(
    new Set(candidates.map((row) => text(row.core_id)).filter(Boolean))
  );

  const { data: templates, error: templateError } = coreIds.length
    ? await supabaseAdmin
        .from("spot_offer_template_unified")
        .select("core_id, sharefull_template_id, sharefull_template_status")
        .in("core_id", coreIds)
    : { data: [], error: null };

  if (templateError) throw templateError;

  const templateByCoreId = new Map(
    (templates ?? []).map((template) => [
      text(template.core_id),
      { id: text(template.sharefull_template_id), status: text(template.sharefull_template_status) },
    ])
  );

  const { data: existingRequests, error: existingError } = await supabaseAdmin
    .from("rpa_runner_jobs")
    .select("id, status, payload")
    .eq("job_type", SHAREFULL_JOB_TYPE)
    .in("status", [...ACTIVE_RUNNER_STATUSES, "completed"])
    .limit(5000);

  if (existingError) throw existingError;

  const activeKeys = new Set(
    (existingRequests ?? []).map((row) => text((row.payload as JsonRecord | null)?.operation_key)).filter(Boolean)
  );

  const registered: Array<{ request_id: string; shift_id: string; sharefull_template_id: string }> = [];
  const skipped: Array<{ shift_id: string; reason: string }> = [];

  for (const row of candidates) {
    const shiftId = text(row.shift_id);
    const coreId = text(row.core_id);
    const template = templateByCoreId.get(coreId) ?? { id: "", status: "" };
    const sharefullTemplateId = template.id;
    const operationKey = `sharefull:create_spot_offer:${mode}:${shiftId}`;

    if (!sharefullTemplateId) {
      skipped.push({ shift_id: shiftId, reason: "sharefull_template_idがありません" });
      continue;
    }
    if (template.status === "template_review") {
      skipped.push({ shift_id: shiftId, reason: "シェアフルテンプレートが審査中です" });
      continue;
    }
    if (activeKeys.has(operationKey)) {
      skipped.push({ shift_id: shiftId, reason: "同じ掲載ジョブが処理中です" });
      continue;
    }

    // NULLは既存データ互換のため掲載可能として扱う。審査中は上で除外する。
    if (row.sharefull_status === "template_review") {
      const { error: statusUpdateError } = await supabaseAdmin
        .from("spot_offer_request_table")
        .update({ sharefull_status: "ready_for_offer" })
        .eq("id", row.id)
        .eq("sharefull_status", "template_review")
        .is("sharefull_job_id", null);
      if (statusUpdateError) throw statusUpdateError;
    }

    const requestDetails = {
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
      created_from: "cron.open-sharefull-jobs",
    };

    const { data, error } = await supabaseAdmin
      .from("rpa_runner_jobs")
      .insert({
        job_type: SHAREFULL_JOB_TYPE,
        status: "pending",
        payload: {
          ...requestDetails,
        },
      })
      .select("id")
      .single();

    if (error) throw error;
    registered.push({ request_id: data.id, shift_id: shiftId, sharefull_template_id: sharefullTemplateId });
    activeKeys.add(operationKey);
  }

  return NextResponse.json({
    ok: true,
    enabled: true,
    execution_mode: mode,
    target_date_from: today,
    registered_count: registered.length,
    skipped_count: skipped.length,
    registered,
    skipped,
  });
}
