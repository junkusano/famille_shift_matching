import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { notifySharefullApplication } from "@/lib/spot-sync/sharefullApplicationNotification";
import { supabaseAdmin } from "@/lib/supabase/service";
import { receiveSharefullMail, finishSharefullMail, sharefullMailWorkFinished } from "@/lib/spot-sync/sharefullMailReceipt";

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

  let receivedId: string | null = null;
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
    if (!ID_PATTERN.test(eventId) || !occurredAt || !Number.isFinite(Date.parse(occurredAt))) {
      return NextResponse.json({ ok: false, error: "キャンセル通知の識別情報が不正です" }, { status: 400 });
    }

    const receipt = await receiveSharefullMail({eventId,kind:"cancelled",jobId,orderId,
      applicationKey:suppliedApplicationKey,occurredAt:new Date(occurredAt).toISOString(),applicantName,cancellationReason});
    receivedId = eventId;
    if (["completed","ignored"].includes(receipt.status)) {
      return NextResponse.json({ok:true,recorded:true,event_id:eventId,outcome:"already_processed"});
    }
    const reject = async (code: string, status: number, requestId?: string) => {
      await finishSharefullMail(eventId,{status:"retry",error_code:code,request_id:requestId});
      return NextResponse.json({ok:false,recorded:true,event_id:eventId,code},{status});
    };

    let requestQuery = supabaseAdmin.from("spot_offer_request_table").select("id,sharefull_job_id,sharefull_order_id,shift_start_date,shift_start_time,shift_end_time").limit(2);
    requestQuery = jobId ? requestQuery.eq("sharefull_job_id", jobId) : requestQuery.eq("sharefull_order_id", orderId);
    const { data: requests, error: requestError } = await requestQuery;
    if (requestError) throw requestError;
    if (!requests?.length) return await reject("REQUEST_NOT_FOUND",404);
    if (requests.length !== 1) return await reject("REQUEST_AMBIGUOUS",409);

    const target = requests[0] as Record<string, unknown>;
    if ((jobId && target.sharefull_job_id !== jobId) || (orderId && target.sharefull_order_id !== orderId)) {
      return await reject("PROVIDER_IDS_MISMATCH",409,String(target.id));
    }
    if (sharefullMailWorkFinished(target)) {
      await finishSharefullMail(eventId,{status:"ignored",outcome:"work_finished",request_id:String(target.id)});
      return NextResponse.json({ok:true,recorded:true,event_id:eventId,outcome:"work_finished"});
    }

    let applicationQuery = supabaseAdmin.from("spot_offer_applications")
      .select("application_key,applicant_name,applicant_sex,applicant_control_url")
      .eq("request_id", String(target.id)).eq("provider", "sharefull").in("state", ["applied", "confirmed", "cancelled"]);
    if (suppliedApplicationKey) applicationQuery = applicationQuery.eq("application_key", suppliedApplicationKey);
    else if (applicantName) applicationQuery = applicationQuery.eq("applicant_name", applicantName);
    let { data: applications, error: applicationError } = await applicationQuery;
    if (applicationError) throw applicationError;
    if (!applications?.length && suppliedApplicationKey.includes("::") && applicantName) {
      const fallback = await supabaseAdmin.from("spot_offer_applications")
        .select("application_key,applicant_name,applicant_sex,applicant_control_url")
        .eq("request_id",String(target.id)).eq("provider","sharefull").eq("applicant_name",applicantName).limit(2);
      if (fallback.error) throw fallback.error;
      applications = fallback.data;
    }
    if ((applications?.length ?? 0) > 1 || (!applications?.length && (!suppliedApplicationKey || !applicantName || suppliedApplicationKey.endsWith("::unknown")))) {
      return await reject("APPLICATION_NOT_IDENTIFIABLE",409,String(target.id));
    }

    // 確定メールを取り逃しても、応募キーの分かる取消を保存して旧確定の再送を無効化する。
    const application = (applications?.[0] ?? {
      application_key:suppliedApplicationKey,applicant_name:applicantName,applicant_sex:null,applicant_control_url:null,
    }) as {
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
    // RPCの重複応答にはstaleが含まれない。再試行時も通知前に最新状態を確認する。
    const { data: current, error: currentError } = await supabaseAdmin.from("spot_offer_applications")
      .select("state,occurred_at").eq("request_id",String(target.id)).eq("provider","sharefull")
      .eq("application_key",application.application_key).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return await reject("APPLICATION_STATE_MISSING",503,String(target.id));
    if (result?.stale || current.state !== "cancelled" || Date.parse(current.occurred_at) !== Date.parse(occurredAt)) {
      await finishSharefullMail(eventId,{status:"ignored",outcome:"stale",request_id:String(target.id)});
      return NextResponse.json({ok:true,recorded:true,event_id:eventId,outcome:"stale"});
    }

    const shiftStart = `${target.shift_start_date ?? ""}T${String(target.shift_start_time ?? "").slice(0, 5)}:00+09:00`;
    const startsAt = Date.parse(shiftStart);
    const untilStart = startsAt - Date.now();
    const urgent = Number.isFinite(startsAt) && untilStart >= 0 && untilStart <= 24 * 60 * 60 * 1000;
    const wasConfirmed = result?.previous_application_state === "confirmed";
    const message = [
      urgent ? "【要至急対応】Sharefull 応募キャンセル" : wasConfirmed ? "【Sharefull 決定後キャンセル】再調整が必要です" : "【Sharefull 応募キャンセル】確認してください",
      `管理番号: ${target.sharefull_order_id || orderId || "不明"}`,
      `求人ID: ${target.sharefull_job_id || jobId || "不明"}`,
      `勤務日: ${target.shift_start_date || "不明"}`,
      `勤務開始: ${target.shift_start_time || "不明"}`,
      "応募はキャンセル済みです。次の候補者を自動確定せず、募集状況と応募者を確認してください。",
    ].join("\n");
    const notification = await notifySharefullApplication({
      provider: "sharefull",
      eventId,
      text: message,
      eventTable: "spot_offer_application_events",
    });
    if (!notification.sent) {
      return await reject("NOTIFICATION_PENDING",503,String(target.id));
    }

    await finishSharefullMail(eventId,{status:"completed",outcome:"cancelled",request_id:String(target.id)});
    return NextResponse.json({ ok: true,recorded:true,event_id:eventId,outcome:"cancelled",duplicate:Boolean(result?.duplicate),notification });
  } catch (error) {
    const collision = error instanceof Error && error.message === "MAIL_EVENT_ID_COLLISION";
    if (receivedId) {
      try { await finishSharefullMail(receivedId,{status:"retry",error_code:"PROCESSING_FAILED"}); } catch { /* GAS再試行へ残す。 */ }
    }
    console.error("[rpa/sharefull/cancelled]",{event_id:receivedId,code:collision?"MAIL_EVENT_ID_COLLISION":"PROCESSING_FAILED"});
    return NextResponse.json({ok:false,code:collision?"MAIL_EVENT_ID_COLLISION":"PROCESSING_FAILED"},{status:collision?409:500});
  }
}
