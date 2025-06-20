import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';

const clientId = process.env.LINEWORKS_CLIENT_ID;
const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT;
const rawPrivateKey = process.env.LINEWORKS_PRIVATE_KEY || '';
const privateKey = rawPrivateKey
  .replace(/\\n/g, '\n')        // \n を改行に
  .replace(/\\\\n/g, '\n')      // 多重バックスラッシュ対応
  .replace(/\\r/g, '');         // 不要な \r 除去（必要に応じ）

const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';

export async function getAccessToken(): Promise<string> {
  if (!clientId || !serviceAccount || !privateKey) {
    console.error('必要な環境変数が不足しています。');
    console.error('LINEWORKS_CLIENT_ID:', clientId);
    console.error('LINEWORKS_SERVICE_ACCOUNT:', serviceAccount);
    console.error('LINEWORKS_PRIVATE_KEY is present:', !!privateKey);
    throw new Error('環境変数の不足により起動できません。');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 60 * 5, // 5分間有効
    aud: serverApiUrl, // ハードコード（余計な誤差排除）
  };

  console.log('[getAccessToken] JWT Payload:', payload);

  let token: string;
  try {
    token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    console.log('[getAccessToken] JWT 署名成功');
  } catch (err) {
    console.error('[getAccessToken] JWT署名エラー:', err);
    throw err;
  }

  try {
    const response: AxiosResponse<{ access_token: string }> = await axios.post(serverApiUrl, null, {
      params: {
        assertion: token,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        scope: 'directory', // 必要に応じて 'user.read directory' など
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('[getAccessToken] アクセストークン取得成功');
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
