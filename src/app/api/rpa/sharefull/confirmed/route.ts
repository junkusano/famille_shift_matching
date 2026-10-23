import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createCloseRequest } from "@/lib/spot_offer/spot_offer_sync_check";
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
  return !!expected && !!supplied && Buffer.byteLength(expected) === Buffer.byteLength(supplied)
    && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let receivedId: string | null = null;
  try {
    const body = await request.json() as Record<string, unknown>;
    const jobId = text(body.sharefull_job_id), orderId = text(body.sharefull_order_id);
    const eventId = text(body.event_id), suppliedApplicationKey = text(body.application_key);
    const occurredAt = text(body.occurred_at, 80), applicantName = text(body.applicant_name);
    if ((!jobId && !orderId) || (jobId && !ID_PATTERN.test(jobId)) || (orderId && !ID_PATTERN.test(orderId))
      || !ID_PATTERN.test(eventId) || !suppliedApplicationKey || !Number.isFinite(Date.parse(occurredAt))) {
      return NextResponse.json({ ok: false, code: "INVALID_EVENT" }, { status: 400 });
    }
    const receipt = await receiveSharefullMail({eventId,kind:"confirmed",jobId,orderId,applicationKey:suppliedApplicationKey,
      occurredAt:new Date(occurredAt).toISOString(),applicantName,cancellationReason:""});
    receivedId = eventId;
    if (["completed","ignored"].includes(receipt.status)) {
      return NextResponse.json({ok:true,recorded:true,event_id:eventId,outcome:"already_processed",close_request_id:receipt.close_request_id});
    }
    const reject = async (code: string, status: number, requestId?: string) => {
      await finishSharefullMail(eventId,{status:"retry",error_code:code,request_id:requestId});
      return NextResponse.json({ok:false,recorded:true,event_id:eventId,code},{status});
    };
    const acknowledge = async (outcome: "queued" | "stale" | "work_finished", requestId: string, closeRequestId?: string) => {
      await finishSharefullMail(eventId,{status:outcome === "queued" ? "completed" : "ignored",
        request_id:requestId,close_request_id:closeRequestId,outcome});
      return NextResponse.json({ok:true,recorded:true,event_id:eventId,outcome,close_request_id:closeRequestId});
    };
    let query = supabaseAdmin.from("spot_offer_request_table").select("*").limit(2);
    query = jobId ? query.eq("sharefull_job_id",jobId) : query.eq("sharefull_order_id",orderId);
    const {data: requests,error: requestError} = await query;
    if (requestError) throw requestError;
    if (!requests?.length) return await reject("REQUEST_NOT_FOUND",404);
    if (requests.length !== 1) return await reject("REQUEST_AMBIGUOUS",409);
    const target = requests[0] as Record<string,unknown>;
    const requestId = String(target.id);
    if ((jobId && target.sharefull_job_id !== jobId) || (orderId && target.sharefull_order_id !== orderId)) {
      return await reject("PROVIDER_IDS_MISMATCH",409,requestId);
    }
    if (sharefullMailWorkFinished(target)) return await acknowledge("work_finished",requestId);
    let applicationKey = suppliedApplicationKey;
    if (applicationKey.endsWith("::unknown") && !applicantName) return await reject("APPLICATION_NOT_IDENTIFIABLE",409,requestId);
    // 旧版が求人IDで組み立てたfallbackキーも、同一案件・同名が一件のときだけ継承する。
    if (applicationKey.includes("::") && applicantName) {
      const {data:known,error:knownError} = await supabaseAdmin.from("spot_offer_applications")
        .select("application_key").eq("request_id",requestId).eq("provider","sharefull").eq("applicant_name",applicantName).limit(2);
      if (knownError) throw knownError;
      if ((known?.length ?? 0) > 1) return await reject("APPLICATION_AMBIGUOUS",409,requestId);
      if (known?.length) applicationKey = String(known[0].application_key);
    }
    const {data:recorded,error:recordError} = await supabaseAdmin.rpc("record_spot_offer_application",{
      p_request_id:requestId,p_provider:"sharefull",p_application_key:applicationKey,p_event_id:eventId,
      p_state:"confirmed",p_occurred_at:new Date(occurredAt).toISOString(),p_name:applicantName||null,p_sex:null,p_url:null,
    });
    if (recordError) throw recordError;
    if (recorded?.stale) return await acknowledge("stale",requestId);
    const outcome = await createCloseRequest(target,"other_application",{
      createdFrom:"/api/rpa/sharefull/confirmed",
      sharefullConfirmation:{applicationKey,eventId,occurredAt:new Date(occurredAt).toISOString()},
    });
    if (outcome?.outcome === "stale") return await acknowledge("stale",requestId);
    if (outcome?.outcome === "target_missing") return await reject("TAIMEE_JOB_ID_MISSING",409,requestId);
    if (!outcome?.close_request_id) return await reject("CLOSE_REQUEST_NOT_PERSISTED",503,requestId);
    // 通知の再試行中に届いた取消・新しい確定で、旧イベントを通知しない。
    const {data:current,error:currentError} = await supabaseAdmin.from("spot_offer_applications")
      .select("state,occurred_at").eq("request_id",requestId).eq("provider","sharefull")
      .eq("application_key",applicationKey).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return await reject("APPLICATION_STATE_MISSING",503,requestId);
    if (current.state !== "confirmed" || Date.parse(current.occurred_at) !== Date.parse(occurredAt)) {
      return await acknowledge("stale",requestId);
    }
    const notification = await notifySharefullApplication({
      provider:"sharefull",eventId,eventTable:"spot_offer_application_events",
      text:[
        "【Sharefull 応募確定】",
        `管理番号: ${target.sharefull_order_id || orderId || "不明"}`,
        `求人ID: ${target.sharefull_job_id || jobId || "不明"}`,
        `勤務日: ${target.shift_start_date || "不明"}`,
        `勤務開始: ${String(target.shift_start_time || "").slice(0,5) || "不明"}`,
        "シェアフルの確定メールを受領し、タイミー募集停止指示を登録しました。実際の停止完了は実行結果をご確認ください。",
      ].join("\n"),
    });
    if (!notification.sent) return await reject("NOTIFICATION_PENDING",503,requestId);
    return await acknowledge("queued",requestId,outcome.close_request_id);
  } catch (error) {
    const collision = error instanceof Error && error.message === "MAIL_EVENT_ID_COLLISION";
    if (receivedId) {
      try { await finishSharefullMail(receivedId,{status:"retry",error_code:"PROCESSING_FAILED"}); } catch { /* 元の処理失敗を返しGAS再試行を維持する。 */ }
    }
    console.error("[rpa/sharefull/confirmed]",{event_id:receivedId,code:collision?"MAIL_EVENT_ID_COLLISION":"PROCESSING_FAILED"});
    return NextResponse.json({ok:false,code:collision?"MAIL_EVENT_ID_COLLISION":"PROCESSING_FAILED"},{status:collision?409:500});
  }
}
