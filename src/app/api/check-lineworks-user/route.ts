import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/getAccessToken';
import { checkLineWorksUserExists } from '@/lib/lineworksService';

export async function POST(req: Request) {
  try {
    console.log('[API] 呼び出し開始');
    const text = await req.text();
    console.log('[API] リクエストボディ（テキスト）:', text);

    const { userId } = JSON.parse(text);
    console.log('[API] userId:', userId);

    const token = await getAccessToken();
    console.log('[API] トークン取得成功');

    const exists = await checkLineWorksUserExists(token, userId);
    console.log('[API] 存在確認結果:', exists);

    return NextResponse.json({ success: true, exists });
  } catch (err) {
    console.error('[API] エラー:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
