import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';
import qs from 'qs'; // 追加で必要ならインストール: npm install qs

const clientId = process.env.LINEWORKS_CLIENT_ID;
const clientSecret = process.env.LINEWORKS_CLIENT_SECRET;
const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT;
const privateKey = (process.env.LINEWORKS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';

console.log("DEBUG LINEWORKS_CLIENT_ID:", process.env.LINEWORKS_CLIENT_ID);
console.log("DEBUG LINEWORKS_SERVICE_ACCOUNT:", process.env.LINEWORKS_SERVICE_ACCOUNT);
console.log("DEBUG LINEWORKS_PRIVATE_KEY:", process.env.LINEWORKS_PRIVATE_KEY?.slice(0, 30)); 


export async function getAccessToken(): Promise<string> {
  if (!clientId || !clientSecret || !serviceAccount || !privateKey) {
    console.error('必要な環境変数が不足しています。');
    throw new Error('環境変数の不足により起動できません。');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 3600,  // GAS と同じく1時間
  };

  const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  try {
    const response: AxiosResponse<{ access_token: string }> = await axios.post(serverApiUrl, qs.stringify({
      assertion: token,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'bot bot.message bot.read directory directory.read orgunit.read user user.email.read user.profile.read user.read'  // GAS の SCOPE に合わせる
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

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
