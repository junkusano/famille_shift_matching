import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { supabaseAdmin } from "@/lib/supabase/service";

const DEFAULT_CHANNEL_ID = "99142491";
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

type ApplicationNotification = {
  provider: string;
  eventId: string;
  text: string;
};

/**
 * テスト応募通知を既存のSharefull内容ポリシー通知と同じLINE WORKS設定で送る。
 * イベント行を短時間claimし、失敗時はclaimを解放してGASから再試行可能にする。
 */
export async function notifySharefullApplication(input: ApplicationNotification): Promise<{
  sent: boolean;
  alreadySent?: boolean;
  inProgress?: boolean;
}> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS).toISOString();
  const channelId = process.env.SHAREFULL_CONTENT_POLICY_CHANNEL_ID?.trim() || DEFAULT_CHANNEL_ID;
  const { data: claim, error: claimError } = await supabaseAdmin
    .from("sharefull_rpa_test_spot_offer_application_events" as never)
    .update({ notification_claimed_at: now.toISOString(), notification_error: null })
    .eq("provider", input.provider)
    .eq("event_id", input.eventId)
    .is("notified_at", null)
    .or(`notification_claimed_at.is.null,notification_claimed_at.lt.${staleBefore}`)
    .select("event_id")
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claim) {
    const { data: event, error: eventError } = await supabaseAdmin
      .from("sharefull_rpa_test_spot_offer_application_events" as never)
      .select("notified_at")
      .eq("provider", input.provider)
      .eq("event_id", input.eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    const notifiedAt = (event as unknown as { notified_at?: string | null } | null)?.notified_at;
    return notifiedAt ? { sent: true, alreadySent: true } : { sent: false, inProgress: true };
  }

  try {
    await sendLWBotMessage(channelId, input.text, await getAccessToken());
    const { error: deliveredError } = await supabaseAdmin
      .from("sharefull_rpa_test_spot_offer_application_events" as never)
      .update({ notified_at: new Date().toISOString(), notification_claimed_at: null, notification_error: null })
      .eq("provider", input.provider)
      .eq("event_id", input.eventId);
    if (deliveredError) throw deliveredError;
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("sharefull_rpa_test_spot_offer_application_events" as never)
      .update({ notification_claimed_at: null, notification_error: message.slice(0, 1000) })
      .eq("provider", input.provider)
      .eq("event_id", input.eventId);
    throw error;
  }
}
