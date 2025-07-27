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

        const imageRes = await fetch(iconUrl);
        console.log('imageRes =', imageRes.url);
        if (!imageRes.ok) {
            console.error('画像取得エラー:', imageRes.statusText);
            return NextResponse.json({ error: '画像取得に失敗しました' }, { status: 400 });
        }

        const imageBlob = await imageRes.blob();
        const fileSize = imageBlob.size;
        const fileName = 'user_icon.jpg';

        console.log('🧩 imageBlob.size:', fileSize);
        console.log('🧩 fileName:', fileName);
        console.log('🧩 userId (encoded):', encodeURIComponent(userId));
        console.log('🧩 accessToken.length:', accessToken.length);
        console.log('🧩 accessToken preview:', accessToken.slice(0, 30) + '...');

        console.log('🚀 アップロードURL取得のfetch開始');

        const metaRes = await fetch(`https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/photo`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileName: fileName,
                fileSize: fileSize
            })
        });

        console.log('📩 fetch完了: status =', metaRes.status);

        if (!metaRes.ok) {
            const errData = await metaRes.json();
            console.error('❌ アップロードURL取得失敗:', errData);
            return NextResponse.json({ error: 'アップロードURL取得失敗', detail: errData }, { status: 500 });
        }

        const metaData = await metaRes.json();
        console.log('✅ アップロードURL取得成功:', metaData);

        const uploadUrl = metaData.uploadUrl;
        if (!uploadUrl) {
            console.error('❗ uploadUrlがundefinedです');
            return NextResponse.json({ error: 'uploadUrlが取得できませんでした' }, { status: 500 });
        }

        const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'image/jpeg'
            },
            body: imageBlob
        });

        console.log('📤 画像PUTアップロード status:', putRes.status);

        if (!putRes.ok) {
            console.error('画像アップロード失敗:', await putRes.text());
            return NextResponse.json({ error: '画像アップロードに失敗しました' }, { status: 500 });
        }

    } catch (err) {
        console.error('APIエラー:', err);
        return NextResponse.json({ error: 'サーバーエラー', detail: err instanceof Error ? err.message : err }, { status: 500 });
    }
}
