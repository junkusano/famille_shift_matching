import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';
import { createClient } from '@supabase/supabase-js';

type AccessTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export async function refreshAccessToken(): Promise<string> {
  const apiId = '12052449';
  const serviceAccount = '3xzf3.serviceaccount@shi-on';
  const privateKey = process.env.LINEWORKS_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!privateKey) throw new Error('Private key not found in env');

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    iss: serviceAccount,
    scope: 'bot',
    aud: `https://auth.worksmobile.com/${apiId}/server/token`,
    iat: now,
    exp: now + 3600,
  };

  const assertion = jwt.sign(jwtPayload, privateKey, { algorithm: 'RS256' });

  try {
    const res: AxiosResponse<AccessTokenResponse> = await axios.post(
      `https://auth.worksmobile.com/b/${apiId}/server/token`,
      {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    console.log('[✅成功] アクセストークン更新:', res.data.access_token);
    return res.data.access_token;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('[❌エラー] アクセストークン更新失敗:', err.response?.data);
    } else {
      console.error('[❌エラー] アクセストークン更新失敗（未知のエラー）:', err);
    }
    throw err;
  }
}

// ✅ Supabaseにトークン保存する関数（route.interval.ts から呼び出す用）
export async function refreshLineworksAccessTokenToSupabase(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const token = await refreshAccessToken();

  const { error } = await supabase
    .from('lineworks_tokens')
    .update({
      access_token: token,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', 'lineworks');

  if (error) {
    console.error('[❌エラー] Supabaseへのトークン保存失敗:', error);
    throw error;
  }

  console.log('[✅成功] Supabaseにトークン保存完了');
}
