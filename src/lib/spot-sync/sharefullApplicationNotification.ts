import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { supabaseAdmin } from "@/lib/supabase/service";
import { sendSpotNotification } from "@/lib/spot-sync/sendSpotNotification";

const DEFAULT_CHANNEL_ID = "99142491";

type ApplicationNotification = {
  provider: string;
  eventId: string;
  text: string;
  eventTable?: "spot_offer_application_events" | "sharefull_rpa_test_spot_offer_application_events";
};

/**
 * Sharefull応募通知を既存のSharefull内容ポリシー通知と同じLINE WORKS設定で送る。
 * イベント行を短時間claimし、失敗時はclaimを解放してGASから再試行可能にする。
 */
export async function notifySharefullApplication(input: ApplicationNotification): Promise<{
  sent: boolean;
  alreadySent?: boolean;
  inProgress?: boolean;
}> {
  const eventTable = input.eventTable ?? "sharefull_rpa_test_spot_offer_application_events";
  const channelId = process.env.SHAREFULL_CONTENT_POLICY_CHANNEL_ID?.trim() || DEFAULT_CHANNEL_ID;
  // UPDATE ... OR ... SELECTは返却行に条件が再適用されるため、claimはRPCで原子的に取得する。
  const { data: claim, error: claimError } = await supabaseAdmin
    .rpc("claim_sharefull_application_notification", {
      p_provider:input.provider,p_event_id:input.eventId,p_event_table:eventTable,
    });

  if (claimError) throw claimError;
  if (!claim) {
    const { data: event, error: eventError } = await supabaseAdmin
      .from(eventTable as never)
      .select("notified_at")
      .eq("provider", input.provider)
      .eq("event_id", input.eventId)
      .maybeSingle();
    if (eventError) throw eventError;
    const notifiedAt = (event as unknown as { notified_at?: string | null } | null)?.notified_at;
    return notifiedAt ? { sent: true, alreadySent: true } : { sent: false, inProgress: true };
  }

  try {
    await sendSpotNotification({topic:'sharefull_application',key:`${eventTable}:${input.provider}:${input.eventId}`,
      channelId,text:input.text,accessToken:await getAccessToken(),isTest:eventTable.startsWith('sharefull_rpa_test_')},
      {sendChannel:sendLWBotMessage});
    const { error: deliveredError } = await supabaseAdmin
      .from(eventTable as never)
      .update({ notified_at: new Date().toISOString(), notification_claimed_at: null, notification_error: null })
      .eq("provider", input.provider)
      .eq("event_id", input.eventId);
    if (deliveredError) throw deliveredError;
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from(eventTable as never)
      .update({ notification_claimed_at: null, notification_error: message.slice(0, 1000) })
      .eq("provider", input.provider)
      .eq("event_id", input.eventId);
    throw error;
  }
}
