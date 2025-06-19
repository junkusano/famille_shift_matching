import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';

// 環境変数の取得
const clientId = process.env.LINEWORKS_CLIENT_ID;
const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT;
const privateKey = (process.env.LINEWORKS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';

// 環境変数の確認
if (!clientId || !serviceAccount || !privateKey) {
  console.error('必要な環境変数が不足しています。');
  console.error('LINEWORKS_CLIENT_ID:', clientId);
  console.error('LINEWORKS_SERVICE_ACCOUNT:', serviceAccount);
  console.error('LINEWORKS_PRIVATE_KEY is present:', !!privateKey);
  throw new Error('環境変数の不足により起動できません。');
}

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 60 * 5, // 有効期限5分
    aud: serverApiUrl,
  };

  console.log('[getAccessToken] JWT Payload:', payload);

  let token: string;
  try {
    token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
  } catch (err) {
    console.error('[getAccessToken] JWT署名エラー:', err);
    throw err;
  }

  console.log('[getAccessToken] JWT Token (一部):', token.slice(0, 50) + '...');

  try {
    const response: AxiosResponse<{ access_token: string }> = await axios.post(serverApiUrl, null, {
      params: {
        assertion: token,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        scope: 'directory',
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('[getAccessToken] Access Token:', response.data.access_token);
    return response.data.access_token;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error('[getAccessToken] Access Token取得失敗:', error.response?.data || error.message);
    } else {
      console.error('[getAccessToken] Access Token取得失敗（未知のエラー）:', error);
    }
    throw error;
  }
}
