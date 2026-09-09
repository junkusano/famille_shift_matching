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

    // 画像を取得
    const imageRes = await fetch(iconUrl);
    if (!imageRes.ok) {
      console.error('画像取得エラー:', imageRes.statusText);
      return NextResponse.json({ error: '画像取得に失敗しました' }, { status: 400 });
    }

    const imageBlob = await imageRes.blob();
    const fileBuffer = Buffer.from(await imageBlob.arrayBuffer());
    const fileSize = fileBuffer.length;
    const fileName = 'user_icon.jpg';

    console.log('🧩 image size:', fileSize);

    // アップロードURLの取得
    const metaRes = await fetch(`https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/photo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileName, fileSize })
    });

    if (!metaRes.ok) {
      const error = await metaRes.json();
      console.error('❌ アップロードURL取得失敗:', error);
      return NextResponse.json({ error: 'アップロードURL取得に失敗', detail: error }, { status: 500 });
    }

    const { uploadUrl } = await metaRes.json();
    console.log('✅ アップロードURL:', uploadUrl);

    // multipart/form-dataのFormData構築
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const CRLF = '\r\n';
    const formHeader =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="Filedata"; filename="${fileName}"${CRLF}` +
      `Content-Type: image/jpeg${CRLF}${CRLF}`;
    const formFooter = `${CRLF}--${boundary}--${CRLF}`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(formHeader, 'utf-8'),
      fileBuffer,
      Buffer.from(formFooter, 'utf-8'),
    ]);

    // PUT ではなく POST でアップロード（Content-Type: multipart/form-data）
    const putRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${accessToken}`
      },
      body: bodyBuffer
    });

    console.log('📤 アップロード実行: status =', putRes.status);
    if (!putRes.ok) {
      const errorText = await putRes.text();
      console.error('❌ 画像アップロード失敗:', errorText);
      return NextResponse.json({ error: '画像アップロード失敗', detail: errorText }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('🔥 サーバーエラー:', err);
    return NextResponse.json({ error: 'サーバーエラー', detail: err instanceof Error ? err.message : err }, { status: 500 });
  }
}
