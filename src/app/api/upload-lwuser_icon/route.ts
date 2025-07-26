import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/getAccessToken';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, iconUrl } = body;

    if (!userId || !iconUrl) {
      return NextResponse.json({ error: 'userIdとiconUrlは必須です' }, { status: 400 });
    }

    console.log('🟢 API受信: userId =', userId);
    console.log('🖼️ iconUrl =', iconUrl);

    const accessToken = await getAccessToken();
    console.log('accessToken =', accessToken);

    // 画像を取得
    const imageRes = await fetch(iconUrl);
    if (!imageRes.ok) {
      console.error('画像取得エラー:', imageRes.statusText);
      return NextResponse.json({ error: '画像取得に失敗しました' }, { status: 400 });
    }

    const imageBlob = await imageRes.blob();
    const fileSize = imageBlob.size;
    const fileName = 'user_icon.jpg';

    // アップロードURLを取得
    const metaRes = await fetch(`https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/photo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileName, fileSize })
    });

    if (!metaRes.ok) {
      const metaErr = await metaRes.json();
      console.error('アップロードURL取得失敗:', metaErr);
      return NextResponse.json({ error: 'アップロードURL取得失敗', detail: metaErr }, { status: 500 });
    }

    const metaData = await metaRes.json();
    const uploadUrl = metaData.uploadUrl;
    if (!uploadUrl) {
      return NextResponse.json({ error: 'uploadUrlが取得できませんでした' }, { status: 500 });
    }

    // PUTで画像アップロード
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg'
      },
      body: imageBlob
    });

    if (!putRes.ok) {
      console.error('画像アップロード失敗:', await putRes.text());
      return NextResponse.json({ error: '画像アップロードに失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('APIエラー:', err);
    return NextResponse.json({ error: 'サーバーエラー', detail: err instanceof Error ? err.message : err }, { status: 500 });
  }
}
