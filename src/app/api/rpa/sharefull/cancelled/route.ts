import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { notifySharefullApplication } from "@/lib/spot-sync/sharefullApplicationNotification";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
function text(value: unknown, limit = 160): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.SHAREFULL_CONFIRMATION_GAS_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const jobId = text(body.sharefull_job_id);
    const orderId = text(body.sharefull_order_id);
    const eventId = text(body.event_id);
    const suppliedApplicationKey = text(body.application_key);
    const applicantName = text(body.applicant_name);
    const cancellationReason = text(body.cancellation_reason, 500);
    const occurredAt = text(body.occurred_at, 80);
    if ((!jobId && !orderId) || (jobId && !ID_PATTERN.test(jobId)) || (orderId && !ID_PATTERN.test(orderId))) {
      return NextResponse.json({ ok: false, error: "有効なSharefull求人IDまたは管理番号が必要です" }, { status: 400 });
    }
    if (!eventId || !occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
      return NextResponse.json({ ok: false, error: "キャンセル通知の識別情報が不正です" }, { status: 400 });
    }

    let requestQuery = supabaseAdmin.from("spot_offer_request_table").select("id,sharefull_job_id,sharefull_order_id,shift_start_date,shift_start_time").limit(2);
    requestQuery = jobId ? requestQuery.eq("sharefull_job_id", jobId) : requestQuery.eq("sharefull_order_id", orderId);
    const { data: requests, error: requestError } = await requestQuery;
    if (requestError) throw requestError;
    if (!requests?.length) return NextResponse.json({ ok: false, error: "該当するSharefull掲載案件が見つかりません" }, { status: 404 });
    if (requests.length !== 1) return NextResponse.json({ ok: false, error: "Sharefull掲載案件を一意に特定できません" }, { status: 409 });

    const target = requests[0] as Record<string, unknown>;
    if ((jobId && target.sharefull_job_id !== jobId) || (orderId && target.sharefull_order_id !== orderId)) {
      return NextResponse.json({ ok: false, error: "メール内の求人IDと管理番号が一致しません" }, { status: 409 });
    }

    let applicationQuery = supabaseAdmin.from("spot_offer_applications")
      .select("application_key,applicant_name,applicant_sex,applicant_control_url")
      .eq("request_id", String(target.id)).eq("provider", "sharefull").in("state", ["applied", "confirmed", "cancelled"]);
    if (suppliedApplicationKey) applicationQuery = applicationQuery.eq("application_key", suppliedApplicationKey);
    else if (applicantName) applicationQuery = applicationQuery.eq("applicant_name", applicantName);
    const { data: applications, error: applicationError } = await applicationQuery;
    if (applicationError) throw applicationError;
    if (!applications?.length || applications.length > 1) {
      return NextResponse.json({ ok: false, error: "キャンセル対象の応募を特定できません。管理画面で確認してください" }, { status: 409 });
    }

    const application = applications[0] as {
      application_key: string;
      applicant_name: string | null;
      applicant_sex: string | null;
      applicant_control_url: string | null;
    };
    const { data: recorded, error: recordError } = await supabaseAdmin.rpc("record_spot_offer_application", {
      p_request_id: target.id as string,
      p_provider: "sharefull",
      p_application_key: application.application_key,
      p_event_id: eventId,
      p_state: "cancelled",
      p_occurred_at: new Date(occurredAt).toISOString(),
      p_name: application.applicant_name,
      p_sex: application.applicant_sex,
      p_url: application.applicant_control_url,
    });
    if (recordError) throw recordError;

    if (cancellationReason) {
      const { error: reasonError } = await supabaseAdmin.from("spot_offer_application_events" as never)
        .update({ cancellation_reason: cancellationReason })
        .eq("provider", "sharefull").eq("event_id", eventId);
      if (reasonError) throw reasonError;
    }

    const result = recorded as Record<string, unknown> | null;
    if (result?.stale) return NextResponse.json({ ok: true, stale: true });

    let notification: { sent: boolean; alreadySent?: boolean; inProgress?: boolean } | undefined;
    if (result?.previous_application_state === "confirmed") {
      const shiftStart = `${target.shift_start_date ?? ""}T${String(target.shift_start_time ?? "").slice(0, 5)}:00+09:00`;
      const startsAt = Date.parse(shiftStart);
      const urgent = Number.isFinite(startsAt) && startsAt - Date.now() <= 24 * 60 * 60 * 1000;
      const message = [
        urgent ? "【要至急対応】Sharefull 決定後キャンセル" : "【Sharefull 決定後キャンセル】再調整が必要です",
        `管理番号: ${target.sharefull_order_id || orderId || "不明"}`,
        `求人ID: ${target.sharefull_job_id || jobId || "不明"}`,
        `勤務日: ${target.shift_start_date || "不明"}`,
        `勤務開始: ${target.shift_start_time || "不明"}`,
        "応募はキャンセル済みです。次の候補者を自動確定せず、空き状況と応募者を確認してください。",
      ].join("\n");
      notification = await notifySharefullApplication({
        provider: "sharefull",
        eventId,
        text: message,
        eventTable: "spot_offer_application_events",
      });
      if (!notification.sent) {
        return NextResponse.json({ ok: false, error: "再調整通知を別処理が送信中です", notification }, { status: 503 });
      }
    }

    return NextResponse.json({ ok: true, duplicate: Boolean(result?.duplicate), notification });
  } catch (error) {
    console.error("[rpa/sharefull/cancelled] failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "Sharefullキャンセル通知の処理に失敗しました" }, { status: 500 });
  }
}
