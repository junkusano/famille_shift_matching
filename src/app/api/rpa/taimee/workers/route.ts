import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, normalizePhone, nullableText, requireTaimeeRpaOperator, splitWorkerName, workMonth } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WorkerPayload = {
  taimee_user_id?: unknown; worker_name?: unknown; phone_number?: unknown; work_date?: unknown;
  offering_id?: unknown; offering_name?: unknown; sms_eligible?: unknown; sms_skip_reason?: unknown;
};

function validWorkDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as WorkerPayload;
    const taimeeUserId = nullableText(body.taimee_user_id, 50);
    const workerName = nullableText(body.worker_name, 200);
    const workDate = nullableText(body.work_date, 10);
    const offeringId = nullableText(body.offering_id, 50);
    const offeringName = nullableText(body.offering_name, 500);
    if (!taimeeUserId || !workerName || !validWorkDate(workDate) || !offeringId || !offeringName) {
      return NextResponse.json({ error: "勤務者情報が不正です" }, { status: 400 });
    }
    const phone = normalizePhone(body.phone_number);
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("taimee_applicants").select("id").eq("taimee_user_id", taimeeUserId).maybeSingle();
    if (existingError) throw existingError;
    const names = splitWorkerName(workerName);
    const now = new Date().toISOString();
    let applicantId: string;
    if (existing) {
      const patch: Record<string, unknown> = { last_name: names.lastName, first_name: names.firstName, source: "rpa", rpa_fetched_at: now };
      // 番号が取れないRPA結果で、CSV等で取得済みの番号を消さない。
      if (phone) { patch.phone = phone; patch.normalized_phone = phone; }
      const { error } = await supabaseAdmin.from("taimee_applicants").update(patch).eq("id", existing.id);
      if (error) throw error;
      applicantId = existing.id;
    } else {
      const { data, error } = await supabaseAdmin.from("taimee_applicants").insert({
        taimee_user_id: taimeeUserId, last_name: names.lastName, first_name: names.firstName,
        phone, normalized_phone: phone, source: "rpa", rpa_fetched_at: now, fetch_status: "success",
      }).select("id").single();
      if (error) throw error;
      applicantId = data.id;
    }
    const smsEligible = body.sms_eligible !== false;
    const skipReason = nullableText(body.sms_skip_reason, 200);
    const { data: job, error: jobLookupError } = await supabaseAdmin.from("taimee_applicant_jobs")
      .select("id").eq("applicant_id", applicantId).eq("work_date", workDate).eq("taimee_job_id", offeringId).maybeSingle();
    if (jobLookupError) throw jobLookupError;
    const jobValues = { job_name: offeringName, period_month: workMonth(workDate), last_detected_at: now, source: "rpa", sms_eligible: smsEligible, sms_skip_reason: skipReason };
    const jobError = job
      ? (await supabaseAdmin.from("taimee_applicant_jobs").update(jobValues).eq("id", job.id)).error
      : (await supabaseAdmin.from("taimee_applicant_jobs").insert({ applicant_id: applicantId, taimee_job_id: offeringId, work_date: workDate, first_detected_at: now, ...jobValues })).error;
    if (jobError) throw jobError;
    const { data: sentLog, error: logError } = await supabaseAdmin.from("taimee_sms_send_logs")
      .select("twilio_status").eq("taimee_user_id", taimeeUserId).eq("work_date", workDate).eq("message_type", "recruitment")
      .in("twilio_status", ["pending", "sent", "queued", "accepted", "sending", "delivered"]).maybeSingle();
    if (logError) throw logError;
    return NextResponse.json({
      ok: true, applicant_id: applicantId,
      sms_status: !smsEligible ? "skipped" : !phone ? "phone_not_found" : sentLog ? "duplicate" : "unsent",
    });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/taimee/workers] failed", error);
    return NextResponse.json({ error: "勤務者情報の登録に失敗しました" }, { status: 500 });
  }
}
