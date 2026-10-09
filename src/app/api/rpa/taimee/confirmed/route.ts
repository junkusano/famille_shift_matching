import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSharefullSyncClient, sharefullRpaMode } from "@/lib/spot-sync/sharefullScope";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
function text(value: unknown, limit = 160): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.TAIMEE_CONFIRMATION_GAS_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (process.env.SPOT_PROVIDER_SYNC_ENABLED !== "true" || sharefullRpaMode() === "test") {
    return NextResponse.json({ ok: false, error: "本番の媒体同期が有効ではありません" }, { status: 503 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const taimeeJobId = text(body.taimee_job_id);
    const templateTitle = text(body.template_title, 240);
    const shiftStartDate = text(body.shift_start_date, 10);
    const shiftStartTime = text(body.shift_start_time, 8);
    const eventId = text(body.event_id);
    const applicationKey = text(body.application_key);
    const occurredAt = text(body.occurred_at, 80);
    const applicantName = text(body.applicant_name);

    const hasValidJobId = !!taimeeJobId && ID_PATTERN.test(taimeeJobId);
    const hasExactJobDetails = !!templateTitle
      && /^\d{4}-\d{2}-\d{2}$/.test(shiftStartDate)
      && /^\d{1,2}:\d{2}$/.test(shiftStartTime);
    if (!hasValidJobId && !hasExactJobDetails) {
      return NextResponse.json({ ok: false, error: "タイミー求人ID、または業務タイトル・勤務日・開始時刻が必要です" }, { status: 400 });
    }
    if (!eventId || !applicationKey || !occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
      return NextResponse.json({ ok: false, error: "確定メールの識別情報が不正です" }, { status: 400 });
    }

    let requestQuery = supabaseAdmin.from("spot_offer_request_table").select("*").limit(2);
    requestQuery = hasValidJobId
      ? requestQuery.eq("taimee_job_id", taimeeJobId)
      : requestQuery.eq("template_title", templateTitle).eq("shift_start_date", shiftStartDate).eq("shift_start_time", shiftStartTime);
    const { data: requests, error: requestError } = await requestQuery;
    if (requestError) throw requestError;
    if (!requests?.length) return NextResponse.json({ ok: false, error: "該当するタイミー掲載案件が見つかりません" }, { status: 404 });
    if (requests.length !== 1) return NextResponse.json({ ok: false, error: "タイミー求人IDから案件を一意に特定できません" }, { status: 409 });

    const target = requests[0] as Record<string, unknown>;
    if ((templateTitle && target.template_title !== templateTitle)
      || (shiftStartDate && target.shift_start_date !== shiftStartDate)
      || (shiftStartTime && String(target.shift_start_time).slice(0, 5) !== shiftStartTime.padStart(5, "0"))) {
      return NextResponse.json({ ok: false, error: "メールの案件情報と登録案件が一致しません" }, { status: 409 });
    }
    if (!isSharefullSyncClient(target.kaipoke_cs_id)) {
      return NextResponse.json({ ok: true, ignored: true, reason: "Sharefull連携対象外" });
    }

    const { data: recorded, error: recordError } = await supabaseAdmin.rpc("record_spot_offer_application", {
      p_request_id: target.id as string,
      p_provider: "taimee",
      p_application_key: applicationKey,
      p_event_id: eventId,
      p_state: "confirmed",
      p_occurred_at: new Date(occurredAt).toISOString(),
      p_name: applicantName || null,
      p_sex: null,
      p_url: null,
    });
    if (recordError) throw recordError;

    const eventResult = recorded as Record<string, unknown> | null;
    if (eventResult?.stale) return NextResponse.json({ ok: true, stale: true });

    const { data: current, error: currentError } = await supabaseAdmin
      .from("spot_offer_request_table")
      .select("id,kaipoke_cs_id,sharefull_job_id,sharefull_order_id,sharefull_status,recruitment_revision")
      .eq("id", target.id as string)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current || !isSharefullSyncClient(current.kaipoke_cs_id) || !current.sharefull_job_id || current.sharefull_status === "closed") {
      return NextResponse.json({ ok: true, queued: false, reason: "シェアフル掲載中の求人がありません" });
    }
    if (!current.sharefull_order_id) {
      return NextResponse.json({ ok: false, error: "シェアフル管理番号がなく、停止ジョブを安全に登録できません" }, { status: 409 });
    }

    const syncOperationKey = `spot-sync:sharefull:close:${current.sharefull_order_id}:${current.recruitment_revision}`;
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("rpa_runner_jobs")
      .select("id")
      .eq("payload->>sync_operation_key", syncOperationKey)
      .limit(1);
    if (existingError) throw existingError;
    if (!existing?.length) {
      const { error: insertError } = await supabaseAdmin.from("rpa_runner_jobs").insert({
        job_type: "sharefull.close_spot_offer",
        status: "pending",
        payload: {
          spot_offer_request_id: current.id,
          sharefull_order_id: current.sharefull_order_id,
          sharefull_job_id: current.sharefull_job_id,
          sync_operation_key: syncOperationKey,
          created_from: "/api/rpa/taimee/confirmed",
        },
      });
      if (insertError && insertError.code !== "23505") throw insertError;
    }

    return NextResponse.json({ ok: true, queued: true, duplicate: Boolean(eventResult?.duplicate) });
  } catch (error) {
    console.error("[rpa/taimee/confirmed] failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "タイミー確定メールの処理に失敗しました" }, { status: 500 });
  }
}
