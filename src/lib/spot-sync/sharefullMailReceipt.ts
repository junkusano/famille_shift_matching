import { createHash } from "node:crypto";
import { supabaseAdmin as db } from "@/lib/supabase/service";

export type SharefullMail = {
  eventId: string; kind: "confirmed" | "cancelled"; jobId: string; orderId: string;
  occurredAt: string; applicationKey: string; applicantName: string; cancellationReason: string;
};

/** メールの同一性を固定し、照合エラーも受領記録に残す。本文・トークンはログに出さない。 */
export async function receiveSharefullMail(mail: SharefullMail) {
  // 旧GASの求人ID::氏名と新版の注文ID::氏名は同じメールのfallback表現。
  const fallbackKeys = [mail.jobId, mail.orderId].filter(Boolean).map(id => `${id}::${mail.applicantName}`);
  const applicationKey = mail.applicantName && fallbackKeys.includes(mail.applicationKey)
    ? `${mail.orderId || mail.jobId}::${mail.applicantName}` : mail.applicationKey;
  const hash = createHash("sha256").update(JSON.stringify({ ...mail, applicationKey })).digest("hex");
  const { error: insertError } = await db.from("spot_offer_mail_receipts").upsert({
    provider: "sharefull", event_id: mail.eventId, event_kind: mail.kind, payload_hash: hash,
    job_id: mail.jobId || null, order_id: mail.orderId || null, occurred_at: mail.occurredAt,
  }, { onConflict: "provider,event_id", ignoreDuplicates: true });
  if (insertError) throw insertError;
  const { data, error } = await db.from("spot_offer_mail_receipts").select("payload_hash,status,close_request_id")
    .eq("provider", "sharefull").eq("event_id", mail.eventId).single();
  if (error) throw error;
  if (data.payload_hash !== hash) throw new Error("MAIL_EVENT_ID_COLLISION");
  const { error: attemptError } = await db.from("spot_offer_mail_receipts")
    .update({ last_attempt_at: new Date().toISOString() }).eq("provider", "sharefull").eq("event_id", mail.eventId);
  if (attemptError) throw attemptError;
  return data as { status: string; close_request_id: string | null };
}

export async function finishSharefullMail(eventId: string, update: {
  status: "retry" | "completed" | "ignored"; error_code?: string | null;
  outcome?: "queued" | "cancelled" | "stale" | "work_finished";
  request_id?: string; close_request_id?: string;
}) {
  const { error } = await db.from("spot_offer_mail_receipts").update({ ...update,
    error_code: update.error_code || null,
    completed_at: ["completed", "ignored"].includes(update.status) ? new Date().toISOString() : null,
  }).eq("provider", "sharefull").eq("event_id", eventId).select("event_id").single();
  if (error) throw error;
  console.info("[sharefull-mail-receipt]",{event_id:eventId,status:update.status,code:update.error_code||null,close_request_id:update.close_request_id||null});
}

export function sharefullMailWorkFinished(target: Record<string, unknown>, now = Date.now()) {
  const date = String(target.shift_start_date || "");
  const start = String(target.shift_start_time || "").slice(0, 5);
  const end = String(target.shift_end_time || target.shift_start_time || "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(end)) return false;
  let endsAt = Date.parse(`${date}T${end}:00+09:00`);
  if (start && end < start) endsAt += 24 * 60 * 60 * 1000;
  return Number.isFinite(endsAt) && endsAt <= now;
}
