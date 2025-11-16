import { supabaseAdmin } from "@/lib/supabase/service";

export async function sendLWBotMessage(channelId: string, text: string, accessToken: string) {
  //lib/lineworks/sendLWBotMessage.ts

  let effectiveChannelId = channelId;

  const { data: secondaryMatch, error: secondaryError } = await supabaseAdmin
    .from("group_lw_channel_info")
    .select("channel_id, channel_id_secondary")
    .eq("channel_id_secondary", channelId)
    .maybeSingle();

  if (secondaryError) {
    console.error(
      "[sendLWBotMessage] select group_lw_channel_info error",
      secondaryError
    );
  }

  if (secondaryMatch && secondaryMatch.channel_id) {
    // 渡された channelId は「隠し部屋」の ID だったので、
    // メイン部屋の channel_id に差し替える
    effectiveChannelId = secondaryMatch.channel_id;
  }

  //const botId = "6807147";  //ヘルパーサービス管理者
  
  const botId ="6807751"; //すまーとアイさん
  const url = `https://www.worksapis.com/v1.0/bots/${botId}/channels/${effectiveChannelId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: {
        type: 'text',
        text,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ メッセージ送信失敗: ${err}`);
  }
}
