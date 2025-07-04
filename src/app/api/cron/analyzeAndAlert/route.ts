import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { analyzeMessages } from '@/lib/supabase/analyzeMessages';
import { getAccessToken } from '@/lib/getAccessToken';
import { sendLWBotMessage } from '@/lib/lineworks/sendLWBotMessage';
import type { MsgLwLog } from '@/types/msgLwLog';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: logs, error } = await supabase
    .from('msg_lw_log')
    .select('*')
    .gte('timestamp', new Date(Date.now() - 1000 * 60 * 60).toISOString());

  if (error) {
    console.error('ログ取得失敗:', error);
    return NextResponse.json({ error: 'ログ取得失敗', detail: error }, { status: 500 });
  }

  const grouped: Record<string, MsgLwLog[]> = logs.reduce((acc, log) => {
    const channelId = log.channel_id ?? 'unknown';
    if (!acc[channelId]) acc[channelId] = [];
    acc[channelId].push(log);
    return acc;
  }, {} as Record<string, MsgLwLog[]>);

  const accessToken = await getAccessToken();

  for (const [channelId, messages] of Object.entries(grouped)) {
    const result = await analyzeMessages(messages);
    if (result.length === 0) continue;

    const message = `⚠️未対応っぽい依頼が見つかりました\n\n${result
      .map((item) => `・${item.text}（理由：${item.reason}）`)
      .join('\n')}`;

    await sendLWBotMessage(channelId, message, accessToken);
    console.log(`✅ Alert sent to ${channelId}`);
  }

  return NextResponse.json({ status: 'ok' });
}
