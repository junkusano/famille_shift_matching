import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';

const clientId = process.env.LINEWORKS_CLIENT_ID!;
const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT!;
//const privateKey = (process.env.LINEWORKS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const privateKey = process.env.LINEWORKS_PRIVATE_KEY ?? '';
const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';

export async function getAccessToken(): Promise<string> {
  console.log('LINEWORKS_PRIVATE_KEY is present:', !!process.env.LINEWORKS_PRIVATE_KEY);
  console.log('LINEWORKS_PRIVATE_KEY length:', process.env.LINEWORKS_PRIVATE_KEY?.length);
  console.log('LINEWORKS_CLIENT_ID:', process.env.LINEWORKS_CLIENT_ID);
  console.log('LINEWORKS_SERVICE_ACCOUNT:', process.env.LINEWORKS_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 60 * 5,
    aud: serverApiUrl,
  };
  
  const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  console.log('[getAccessToken] JWT Payload:', payload);
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