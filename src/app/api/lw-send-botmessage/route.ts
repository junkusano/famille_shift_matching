// app/api/lw-send-botmessage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendLWBotMessage } from '@/lib/lineworks/sendLWBotMessage';
import { getAccessToken } from '@/lib/getAccessToken'; // 取得関数が必要です

export async function POST(req: NextRequest) {
  try {
    const { channelId, text } = await req.json();

    if (!channelId || !text) {
      return NextResponse.json({ error: 'channelIdとtextは必須です' }, { status: 400 });
    }

    const accessToken = await getAccessToken();
    await sendLWBotMessage(channelId, text, accessToken);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ APIエラー:', error);
    return NextResponse.json({ error: '送信処理中にエラーが発生しました' }, { status: 500 });
  }
}
