import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/sms";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, nullableText, renderRecruitmentTemplate, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const GROUP_KEY = "taimee_recruit_sms";
const KEY_NAME = "default_template";
const MESSAGE_TYPE = "recruitment";

type SmsWorker = { taimeeUserId?: unknown; workDate?: unknown; offeringId?: unknown; offeringName?: unknown };

function validDate(value: string | null): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }

async function loadTemplate(): Promise<string> {
  const { data, error } = await supabaseAdmin.from("env_variables").select("value")
    .eq("group_key", GROUP_KEY).eq("key_name", KEY_NAME).maybeSingle();
  if (error) throw error;
  if (!data?.value) throw new Error("SMSテンプレートが未設定です");
  return data.value;
}

async function reserveLog(args: {
  applicantId: string; taimeeUserId: string; phone: string; workerName: string; workDate: string;
  offeringId: string | null; offeringName: string | null; messageBody: string;
}): Promise<{ id: string; duplicate: boolean }> {
  const existing = await supabaseAdmin.from("taimee_sms_send_logs").select("id,twilio_status")
    .eq("taimee_user_id", args.taimeeUserId).eq("work_date", args.workDate).eq("message_type", MESSAGE_TYPE).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && ["pending", "sent", "queued", "accepted", "sending", "delivered"].includes(existing.data.twilio_status)) {
    return { id: existing.data.id, duplicate: true };
  }
  const record = {
    applicant_id: args.applicantId, taimee_user_id: args.taimeeUserId, recipient_phone: args.phone,
    message_body: args.messageBody, twilio_status: "pending", work_date: args.workDate,
    message_type: MESSAGE_TYPE, offering_id: args.offeringId, offering_name: args.offeringName,
  };
  if (existing.data) {
    const { data, error } = await supabaseAdmin.from("taimee_sms_send_logs").update(record).eq("id", existing.data.id).select("id").single();
    if (error) throw error;
    return { id: data.id, duplicate: false };
  }
  const { data, error } = await supabaseAdmin.from("taimee_sms_send_logs").insert(record).select("id").single();
  if (!error) return { id: data.id, duplicate: false };
  // 一意制約競合時は、先行リクエストが送信予約済みなのでTwilioを呼ばない。
  const concurrent = await supabaseAdmin.from("taimee_sms_send_logs").select("id")
    .eq("taimee_user_id", args.taimeeUserId).eq("work_date", args.workDate).eq("message_type", MESSAGE_TYPE).maybeSingle();
  if (concurrent.data) return { id: concurrent.data.id, duplicate: true };
  throw error;
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as { work_date?: unknown; message_type?: unknown; workers?: unknown };
    const requestedWorkDate = nullableText(body.work_date, 10);
    if (!validDate(requestedWorkDate) || body.message_type !== MESSAGE_TYPE || !Array.isArray(body.workers) || !body.workers.length || body.workers.length > 100) {
      return NextResponse.json({ error: "送信対象が不正です" }, { status: 400 });
    }
    const template = await loadTemplate();
    const results: Array<{ taimee_user_id: string; status: string; error_message?: string }> = [];
    for (const rawWorker of body.workers as SmsWorker[]) {
      const taimeeUserId = nullableText(rawWorker.taimeeUserId, 50);
      const workDate = nullableText(rawWorker.workDate, 10);
      const offeringId = nullableText(rawWorker.offeringId, 50);
      const offeringName = nullableText(rawWorker.offeringName, 500);
      if (!taimeeUserId || !validDate(workDate) || workDate !== requestedWorkDate) continue;
      const { data: applicant, error: applicantError } = await supabaseAdmin.from("taimee_applicants")
        .select("id,last_name,first_name,phone,normalized_phone,send_disabled").eq("taimee_user_id", taimeeUserId).maybeSingle();
      if (applicantError) throw applicantError;
      if (!applicant?.phone || applicant.send_disabled) {
        results.push({ taimee_user_id: taimeeUserId, status: applicant?.phone ? "skipped" : "phone_not_found" });
        continue;
      }
      const workerName = [applicant.last_name, applicant.first_name].filter(Boolean).join(" ") || "タイミー勤務者";
      const messageBody = renderRecruitmentTemplate(template, workDate);
      const reservation = await reserveLog({
        applicantId: applicant.id, taimeeUserId, phone: applicant.phone, workerName, workDate,
        offeringId, offeringName, messageBody,
      });
      if (reservation.duplicate) { results.push({ taimee_user_id: taimeeUserId, status: "duplicate" }); continue; }
      const sent = await sendSms({ to: applicant.phone, body: messageBody });
      if (sent.status === "ok") {
        await Promise.all([
          supabaseAdmin.from("taimee_sms_send_logs").update({ twilio_status: "sent", twilio_message_sid: sent.messageSid, sent_at: new Date().toISOString() }).eq("id", reservation.id),
          supabaseAdmin.from("taimee_applicants").update({ last_sent_at: new Date().toISOString() }).eq("id", applicant.id),
        ]);
        results.push({ taimee_user_id: taimeeUserId, status: "sent" });
      } else {
        const reason = sent.status === "skipped" ? sent.reason : "Twilio送信エラー";
        const status = reason === "invalid_phone" ? "phone_not_found" : "failed";
        await supabaseAdmin.from("taimee_sms_send_logs").update({ twilio_status: status, twilio_error_message: reason }).eq("id", reservation.id);
        results.push({ taimee_user_id: taimeeUserId, status, error_message: reason });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/taimee/sms/send] failed", error);
    return NextResponse.json({ error: "SMS送信に失敗しました" }, { status: 500 });
  }
}
