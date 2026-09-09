import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";

type Candidate = { staff_id: string; staff_name: string; address: string | null; email: string | null; phone: string | null; retirement_date: string | null; staff_kind: "manager" | "contract" | "other"; reentry_blacklisted: boolean; last_reentry_invitation_at: string | null };

async function requireManager(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("UNAUTHORIZED");
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error("UNAUTHORIZED");
  const { data: me } = await supabaseAdmin.from("users").select("system_role").eq("auth_user_id", user.id).maybeSingle();
  if (!["admin", "manager"].includes((me?.system_role ?? "").toLowerCase())) throw new Error("FORBIDDEN");
  return user.id;
}

function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました";
  return NextResponse.json({ ok: false, error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500 });
}

function html(text: string) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }
function reentryUrl(req: NextRequest) { return `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? req.nextUrl.origin}/entry/reapply`; }
function addressCity(address: string | null) {
  if (!address) return "";
  const m = address.match(/^.*?(?:市(?:.*?区)?|郡.*?[町村]|[町村])/);
  return m?.[0] ?? address;
}
async function staffLog(staffId: string, detail: string, actor: string) {
  await supabaseAdmin.from("staff_log").insert({ staff_id: staffId, action_at: new Date().toISOString(), action_detail: detail, registered_by: actor });
}

export async function GET(req: NextRequest) {
  try {
    await requireManager(req);
    const [{ data: candidates, error }, { data: settings }] = await Promise.all([
      supabaseAdmin.from("reentry_recruitment_candidates").select("*").order("retirement_date", { ascending: false }),
      supabaseAdmin.from("reentry_recruitment_settings").select("*").eq("id", true).maybeSingle(),
    ]);
    if (error) throw error;
    return NextResponse.json({ ok: true, candidates: (candidates ?? []).map((c: Candidate) => ({ ...c, address_city: addressCity(c.address) })), settings });
  } catch (error) { return responseError(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireManager(req);
    const body = await req.json() as { action: "blacklist" | "settings"; staffId?: string; blacklisted?: boolean; emailSubject?: string; emailBody?: string; smsBody?: string };
    if (body.action === "blacklist" && body.staffId && typeof body.blacklisted === "boolean") {
      const { error } = await supabaseAdmin.from("form_entries").update({ reentry_blacklisted: body.blacklisted }).eq("id", body.staffId);
      if (error) throw error;
      await staffLog(body.staffId, body.blacklisted ? "Re-entry募集ブラックリスト登録" : "Re-entry募集ブラックリスト解除", actor);
    } else if (body.action === "settings" && body.emailSubject && body.emailBody && body.smsBody) {
      const { error } = await supabaseAdmin.from("reentry_recruitment_settings").upsert({ id: true, email_subject: body.emailSubject, email_body: body.emailBody, sms_body: body.smsBody, updated_by: actor, updated_at: new Date().toISOString() });
      if (error) throw error;
    } else return NextResponse.json({ ok: false, error: "不正なリクエストです" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) { return responseError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireManager(req);
    const body = await req.json() as { staffIds?: string[]; emailSubject?: string; emailBody?: string; smsBody?: string };
    const staffIds = [...new Set(body.staffIds ?? [])];
    if (!staffIds.length || !body.emailSubject || !body.emailBody || !body.smsBody) return NextResponse.json({ ok: false, error: "送信対象または本文がありません" }, { status: 400 });
    if (staffIds.length > 25) return NextResponse.json({ ok: false, error: "送信は25名ずつ実行してください" }, { status: 400 });
    const { data: candidates, error } = await supabaseAdmin.from("reentry_recruitment_candidates").select("*").in("staff_id", staffIds).eq("reentry_blacklisted", false);
    if (error) throw error;
    const campaignKey = crypto.randomUUID();
    const summary = { requested: staffIds.length, excluded: staffIds.length - (candidates?.length ?? 0), emailAccepted: 0, smsFallback: 0, failed: 0 };
    for (const candidate of (candidates ?? []) as Candidate[]) {
      const url = reentryUrl(req);
      const namedEmail = body.emailBody.replaceAll("〇〇さん", `${candidate.staff_name}さん`).replaceAll("{{reentry_url}}", url);
      const sms = body.smsBody.replaceAll("{{reentry_url}}", url);
      const { data: recipient, error: recipientError } = await supabaseAdmin.from("reentry_campaign_recipients").insert({ staff_id: candidate.staff_id, campaign_key: campaignKey, email: candidate.email, phone: candidate.phone, email_status: "not_attempted", sms_status: "not_attempted" }).select("id").single();
      if (recipientError || !recipient) throw recipientError ?? new Error("送信履歴を作成できません");
      const emailResult = candidate.email ? await sendEmail({ to: candidate.email, subject: body.emailSubject, html: html(namedEmail) }) : { status: "error", error: "Email送付先なし" };
      if (emailResult.status === "ok") {
        await supabaseAdmin.from("reentry_campaign_recipients").update({ email_attempted_at: new Date().toISOString(), email_status: "accepted", successful_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", recipient.id);
        await staffLog(candidate.staff_id, "Re-entry募集案内送付\n送信方法：Email\n結果：SMTP送信受付成功", actor); summary.emailAccepted++; continue;
      }
      const emailError = "error" in emailResult ? String(emailResult.error ?? "Email送信失敗") : "Email送信失敗";
      await supabaseAdmin.from("reentry_campaign_recipients").update({ email_attempted_at: new Date().toISOString(), email_status: "failed", email_error: emailError }).eq("id", recipient.id);
      if (!candidate.phone) { await supabaseAdmin.from("reentry_campaign_recipients").update({ sms_status: "not_sent", sms_error: "SMS送付先なし" }).eq("id", recipient.id); await staffLog(candidate.staff_id, "Re-entry募集案内\nEmail失敗\nSMS送付先なし", actor); summary.failed++; continue; }
      const smsResult = await sendSms({ to: candidate.phone, body: sms, statusCallback: `${req.nextUrl.origin}/api/webhooks/twilio/reentry-status` });
      if (smsResult.status === "ok") { await supabaseAdmin.from("reentry_campaign_recipients").update({ sms_fallback_sent_at: new Date().toISOString(), sms_status: "accepted", sms_message_sid: smsResult.messageSid, successful_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", recipient.id); await staffLog(candidate.staff_id, "Re-entry募集案内送付\nEmail送信失敗のためSMSへフォールバック\nSMS：送信受付成功", actor); summary.smsFallback++; }
      else { await supabaseAdmin.from("reentry_campaign_recipients").update({ sms_status: "failed", sms_error: smsResult.status === "skipped" ? smsResult.reason : "Twilio送信失敗" }).eq("id", recipient.id); await staffLog(candidate.staff_id, "Re-entry募集案内送付\nEmail失敗\nSMS送信失敗", actor); summary.failed++; }
    }
    return NextResponse.json({ ok: true, summary });
  } catch (error) { return responseError(error); }
}
