import { createClient } from '@supabase/supabase-js';
import { analyzeMessages } from '@/lib/supabase/analyzeMessages';
import { getAccessToken } from '@/lib/getAccessToken';
import { sendLWBotMessage } from '@/lib/lineworks/sendLWBotMessage';
import type { MsgLwLog } from '@/types/msgLwLog';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: logs, error } = await supabase
    .from('msg_lw_temp')
    .select('*')
    .gte('timestamp', new Date(Date.now() - 1000 * 60 * 60).toISOString()); // 直近1時間

  if (error) {
    console.error('ログ取得失敗:', error);
    return;
  }

  // channel_id ごとにグループ化
  const grouped: Record<string, MsgLwLog[]> = logs.reduce((acc, log) => {
    const channelId = log.channel_id;
    if (!acc[channelId]) acc[channelId] = [];
    acc[channelId].push(log);
    return acc;
  }, {} as Record<string, MsgLwLog[]>);
  const accessToken = await getAccessToken();

  for (const [channelId, messages] of Object.entries(grouped)) {
    const result = await analyzeMessages(messages); // ✅ 正しい引数

    if (result.length === 0) continue;

    const message = `⚠️未対応っぽい依頼が見つかりました\n\n${result
      .map((item) => `・${item.text}（理由：${item.reason}）`)
      .join('\n')}`; // ✅ message を先に定義

    await sendLWBotMessage(channelId, message, accessToken); // ✅ messageを後で使う
    console.log(`✅ Alert sent to ${channelId}`);
  }
}

main();
