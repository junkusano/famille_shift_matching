import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';
import { createClient } from '@supabase/supabase-js';

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// LINE WORKSアクセストークン取得
export async function refreshAccessToken(): Promise<string> {
  const clientId = 'bg4uJjAlSS0gTXejntBa'; // LINE WORKS Client ID
  const serviceAccount = '3xzf3.serviceaccount@shi-on'; // Service Account ID
  //const apiId = '12052449'; // LINE WORKS API ID
  const privateKey = process.env.LINEWORKS_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!privateKey) throw new Error('Private key not found in env');

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    iss: clientId,
    sub: serviceAccount,
    aud: 'https://auth.worksmobile.com/oauth2/v2.0/token',
    iat: now,
    exp: now + 3600,
  };

  const jwtToken = jwt.sign(jwtPayload, privateKey, { algorithm: 'RS256' });

  const formParams = new URLSearchParams();
  formParams.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  formParams.append('assertion', jwtToken);

  try {
    const res: AxiosResponse<AccessTokenResponse> = await axios.post(
      'https://auth.worksmobile.com/oauth2/v2.0/token',
      formParams,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    console.log('[🧪DEBUG] レスポンス:', res.data);

    if (res.data.access_token) {
      console.log('[✅成功] アクセストークン取得:', res.data.access_token);
      return res.data.access_token;
    } else {
      console.error('[❌エラー] access_token がレスポンスに含まれていません');
      throw new Error('access_token missing in response');
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('[❌Axiosエラー]', err.response?.data || err.message);
    } else {
      console.error('[❌未知エラー]', err);
    }
    throw err;
  }
}

// Supabaseにトークンを保存
export async function refreshLineworksAccessTokenToSupabase(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const token = await refreshAccessToken();

  const { error, status } = await supabase
    .from('lineworks_tokens')
    .update({
      access_token: token,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', 'lineworks');

  if (error) {
    console.error('[❌エラー] Supabase保存失敗:', error);
    throw error;
  }

  console.log(`[✅成功] Supabaseにトークン保存完了（HTTPステータス: ${status}）`);
}
