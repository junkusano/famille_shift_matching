// app/api/lw-send-botmessage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendLWBotMessage } from '@/lib/lineworks/sendLWBotMessage';
import {
  buildRecoveredMentionText,
  sendLWBotMentionMessage,
  type MentionTarget,
} from '@/lib/lineworks/sendLWBotMentionMessage';
import { getAccessToken } from '@/lib/getAccessToken'; // 取得関数が必要です

const LW_BOT_NO =
  process.env.LINEWORKS_BOT_NO ||
  process.env.WORKS_BOT_NO ||
  process.env.LW_BOT_NO ||
  '6807751';

function parseMentions(value: unknown): MentionTarget[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const mention = item as { userId?: unknown; label?: unknown };
    const userId = typeof mention.userId === 'string' ? mention.userId.trim() : '';
    const label = typeof mention.label === 'string' ? mention.label.trim() : '';
    return userId ? [{ userId, label: label || userId }] : [];
  });
}

export async function POST(req: NextRequest) {
  try {
    const { channelId, text, mentions: rawMentions } = await req.json();

    if (!channelId || !text) {
      return NextResponse.json({ error: 'channelIdとtextは必須です' }, { status: 400 });
    }

    const accessToken = await getAccessToken();
    const mentions = parseMentions(rawMentions);
    if (mentions.length > 0) {
      await sendLWBotMentionMessage({
        botId: LW_BOT_NO,
        channelId,
        accessToken,
        mentions,
        buildText: (activeMentions, recoveryNotes) =>
          buildRecoveredMentionText(text, mentions, activeMentions, recoveryNotes),
      });
    } else {
      await sendLWBotMessage(channelId, text, accessToken);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ APIエラー:', error);
    return NextResponse.json({ error: '送信処理中にエラーが発生しました' }, { status: 500 });
  }
}
