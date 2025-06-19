import jwt from 'jsonwebtoken';
import axios from 'axios';

// 環境変数から値を取得
const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT!;
const privateKey = process.env.LINEWORKS_PRIVATE_KEY!.replace(/\\n/g, '\n');
const clientId = process.env.LINEWORKS_CLIENT_ID!;
const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';

export default async function getAccessToken(): Promise<string> {
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
    const response = await axios.post(serverApiUrl, null, {
      params: {
        assertion: token,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        scope: 'directory',
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data.access_token;
  } catch (error: any) {
    console.error('Access Token取得失敗:', error.response ? error.response.data : error.message);
    throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
  }
}
