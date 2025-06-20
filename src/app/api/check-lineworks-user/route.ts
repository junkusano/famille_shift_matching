import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/getAccessToken';
import { checkLineWorksUserExists } from '@/lib/lineworksService';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    console.log('[API] ユーザー確認リクエスト:', userId);

    const token = await getAccessToken();
    console.log('[API] トークン取得成功');

    const exists = await checkLineWorksUserExists(token, userId);
    console.log('[API] 存在確認結果:', exists);

    return NextResponse.json({ success: true, exists });
  } catch (err) {
    console.error('[API] エラー発生:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}



