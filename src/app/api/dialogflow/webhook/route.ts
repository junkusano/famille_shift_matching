import { NextRequest, NextResponse } from "next/server";
import { leaveGroupMember } from "@/lib/lineworks/leaveGroupMember";
import { supabaseAdmin } from "@/lib/supabase/service";

type PendingQuit = {
  session_key: string;
  channel_id: string;
  requester_lw_userid: string | null;
  intent_name: string | null;
  status: string;
  expires_at: string | null;
};

const SESSION_TTL_MS = 7 * 60 * 1000;
const ALLOWED_INTENTS = new Set(["quit_lw_group", "confirm_yes", "confirm_no"]);

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function buildSessionKey(channelId: string, requesterLwUserid: string | null) {
  return `${channelId}::${requesterLwUserid ?? "unknown"}`;
}

function extractIntentName(body: Record<string, unknown>): string | null {
  const fulfillmentInfo = body.fulfillmentInfo as Record<string, unknown> | undefined;
  const intentInfo = body.intentInfo as Record<string, unknown> | undefined;
  return normalizeString(fulfillmentInfo?.tag)
    ?? normalizeString(intentInfo?.displayName)
    ?? normalizeString(intentInfo?.lastMatchedIntent);
}

function textResponse(text: string, clear = false) {
  return NextResponse.json({
    fulfillment_response: { messages: [{ text: { text: [text] } }] },
    ...(clear ? { sessionInfo: { parameters: { operation_type: null, confirm_summary: null } } } : {}),
  });
}

function noReply() {
  return NextResponse.json({});
}

async function getPending(sessionKey: string): Promise<PendingQuit | null> {
  const { data, error } = await supabaseAdmin
    .from("dialogflow_pending_shift_requests")
    .select("session_key,channel_id,requester_lw_userid,intent_name,status,expires_at")
    .eq("session_key", sessionKey)
    .maybeSingle();
  if (error) throw error;
  return data as PendingQuit | null;
}

async function startQuitSession(params: { sessionKey: string; channelId: string; requesterLwUserid: string }) {
  const summary = "このグループから退出します。よろしければ「OK」、取り消す場合は「キャンセル」と返信してください。";
  const { error } = await supabaseAdmin.from("dialogflow_pending_shift_requests").upsert({
    session_key: params.sessionKey,
    channel_id: params.channelId,
    requester_lw_userid: params.requesterLwUserid,
    intent_name: "quit_lw_group",
    status: "confirming",
    source_message: "退出依頼",
    last_message: "退出依頼",
    confirm_summary: summary,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  }, { onConflict: "session_key" });
  if (error) throw error;
  return textResponse(summary);
}

async function finishSession(sessionKey: string, status: "completed" | "cancelled") {
  const { error } = await supabaseAdmin
    .from("dialogflow_pending_shift_requests")
    .update({ status, expires_at: new Date().toISOString() })
    .eq("session_key", sessionKey);
  if (error) throw error;
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-dialogflow-secret");
    if (!process.env.DIALOGFLOW_WEBHOOK_SECRET || secret !== process.env.DIALOGFLOW_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const intentName = extractIntentName(body);

    // Dialogflowには退出処理以外の業務操作をさせない。
    if (!intentName || !ALLOWED_INTENTS.has(intentName)) return noReply();

    const sessionInfo = body.sessionInfo as Record<string, unknown> | undefined;
    const parameters = (sessionInfo?.parameters ?? {}) as Record<string, unknown>;
    const channelId = normalizeString(parameters.channel_id);
    const requesterLwUserid = normalizeString(parameters.requester_lw_userid);
    if (!channelId || !requesterLwUserid) return textResponse("退出処理に必要な情報を確認できませんでした。");

    const sessionKey = buildSessionKey(channelId, requesterLwUserid);

    if (intentName === "quit_lw_group") {
      return await startQuitSession({ sessionKey, channelId, requesterLwUserid });
    }

    const pending = await getPending(sessionKey);
    const expired = !pending?.expires_at || new Date(pending.expires_at).getTime() <= Date.now();
    if (!pending || pending.intent_name !== "quit_lw_group" || pending.status !== "confirming" || expired) {
      return noReply();
    }

    if (intentName === "confirm_no") {
      await finishSession(sessionKey, "cancelled");
      return textResponse("退出を取り消しました。", true);
    }

    const result = await leaveGroupMember(pending.channel_id, pending.requester_lw_userid ?? requesterLwUserid);
    if (!result.success) return textResponse(result.error);

    await finishSession(sessionKey, "completed");
    return textResponse("グループから退出しました。", true);
  } catch (error) {
    console.error("[dialogflow quit-only webhook] unexpected error", error);
    return textResponse("退出処理中にエラーが発生しました。");
  }
}
