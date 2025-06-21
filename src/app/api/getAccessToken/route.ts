import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';
import qs from 'qs';

export async function GET() {
  const clientId = process.env.LINEWORKS_CLIENT_ID;
  const clientSecret = process.env.LINEWORKS_CLIENT_SECRET;
  const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT;
  const privateKey = (process.env.LINEWORKS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';

  console.log("DEBUG LINEWORKS_CLIENT_ID:", clientId);
  console.log("DEBUG LINEWORKS_CLIENT_SECRET:", clientSecret ? '****' : 'undefined');
  console.log("DEBUG LINEWORKS_SERVICE_ACCOUNT:", serviceAccount);
  console.log("DEBUG LINEWORKS_PRIVATE_KEY:", privateKey ? '****' : 'undefined');

  if (!clientId || !clientSecret || !serviceAccount || !privateKey) {
    console.error('必要な環境変数が不足しています。');
    return NextResponse.json({ error: '環境変数の不足により起動できません。' }, { status: 500 });
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 3600,
  };

  try {
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

    const response: AxiosResponse<{ access_token: string }> = await axios.post(serverApiUrl, qs.stringify({
      assertion: token,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'bot bot.message bot.read directory directory.read orgunit.read user user.email.read user.profile.read user.read'
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('[getAccessToken API] Token取得成功');
    return NextResponse.json({ accessToken: response.data.access_token });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('[getAccessToken API] Access Token取得失敗:');
      console.error('status:', err.response?.status);
      console.error('data:', err.response?.data);
    } else {
      console.error('[getAccessToken API] 未知のエラー:', err);
    }
    return NextResponse.json({ error: 'Token取得失敗', details: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
