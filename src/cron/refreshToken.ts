import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import axios from 'axios';

export async function GET() {
  try {
    const now = Math.floor(Date.now() / 1000);

    const clientId = process.env.LINEWORKS_CLIENT_ID!;
    const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT!;
    const privateKey = process.env.LINEWORKS_PRIVATE_KEY!.replace(/\\n/g, '\n');
    const clientSecret = process.env.LINEWORKS_CLIENT_SECRET!;
    const scope = 'bot'; // GASで使っているscopeに合わせる（必要に応じて変更）

    // ① JWTの生成
    const payload = {
      iss: clientId,
      sub: serviceAccount,
      iat: now,
      exp: now + 3600,
      aud: 'https://auth.worksmobile.com/oauth2/v2.0/token',
    };

    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      header: { alg: 'RS256', typ: 'JWT' },
    });

    // ② アクセストークン取得
    const formParams = new URLSearchParams();
    formParams.append('assertion', token);
    formParams.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    formParams.append('client_id', clientId);
    formParams.append('client_secret', clientSecret);
    formParams.append('scope', scope);

    const res = await axios.post('https://auth.worksmobile.com/oauth2/v2.0/token', formParams, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = res.data.access_token;

    if (!accessToken) {
      console.error('[❌エラー] access_token がレスポンスに含まれていません');
      throw new Error('access_token missing in response');
    }

    console.log('[✅アクセストークン]', accessToken);

    return NextResponse.json({ access_token: accessToken });
  } catch (err) {
    console.error('❌ 手動トークン更新失敗:', err);
    return NextResponse.json({ error: 'アクセストークン更新失敗', detail: err }, { status: 500 });
  }
}
