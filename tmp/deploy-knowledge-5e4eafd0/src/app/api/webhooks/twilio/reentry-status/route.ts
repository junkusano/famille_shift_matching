import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return NextResponse.json({ ok: false, error: "TWILIO_AUTH_TOKEN is required for webhook verification" }, { status: 503 });
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!twilio.validateRequest(authToken, signature, req.url, params)) return NextResponse.json({ ok: false }, { status: 403 });
  const sid = params.MessageSid;
  const status = params.MessageStatus;
  if (!sid || !status) return NextResponse.json({ ok: false }, { status: 400 });
  const values = ["queued", "sent", "delivered"].includes(status) ? { sms_status: "accepted", updated_at: new Date().toISOString() } : { sms_status: "failed", sms_error: `Twilio status: ${status}`, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin.from("reentry_campaign_recipients").update(values).eq("sms_message_sid", sid).select("staff_id").maybeSingle();
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  if (data && ["failed", "undelivered"].includes(status)) await supabaseAdmin.from("staff_log").insert({ staff_id: data.staff_id, action_at: new Date().toISOString(), action_detail: `Re-entry募集 SMS delivery failure\nTwilio status: ${status}`, registered_by: "twilio_webhook" });
  return NextResponse.json({ ok: true });
}
