import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';

const serviceAccount = '3xzf3.serviceaccount@shi-on';
const privateKey = `-----BEGIN PRIVATE KEY-----
あなたのPRIVATE_KEY文字列
-----END PRIVATE KEY-----`;
const clientId = 'bg4uJjAlSS0gTXejntBa';
const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 60 * 5,
    aud: serverApiUrl,
  };
  const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

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

    console.log('Access Token:', response.data.access_token);
    return response.data.access_token;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error('Access Token取得失敗:', error.response?.data || error.message);
    } else {
      console.error('Access Token取得失敗（未知のエラー）:', error);
    }
    throw error;
  }
}
