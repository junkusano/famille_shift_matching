import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';
import { createClient } from '@supabase/supabase-js';

// 型定義を明確化
interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// トークンをLINE WORKSから取得する関数
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
    const url = `https://auth.worksmobile.com/b/${apiId}/server/token`;

    const res: AxiosResponse<AccessTokenResponse> = await axios.post(
      url,
      null,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        params: {
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        },
      }
    );

    console.log('[🧪DEBUG] レスポンス全体:', res.data);

    if (res.data.access_token) {
      console.log('[✅成功] アクセストークン更新:', res.data.access_token);
      return res.data.access_token;
    } else {
      console.error('[❌エラー] access_token がレスポンスに含まれていません');
      throw new Error('access_token missing in response');
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('[❌Axiosエラー] アクセストークン更新失敗:', err.response?.data || err.message);
    } else {
      console.error('[❌未知エラー] アクセストークン更新失敗:', err);
    }
    throw err;
  }
}

// Supabaseにトークンを保存する関数
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
    console.error('[❌エラー] Supabaseへのトークン保存失敗:', error);
    throw error;
  }

  console.log(`[✅成功] Supabaseにトークン保存完了（HTTPステータス: ${status}）`);
}
