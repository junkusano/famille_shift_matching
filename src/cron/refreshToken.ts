import jwt from 'jsonwebtoken';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ←Service Roleでのみ更新可能
);

export async function refreshAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const clientId = process.env.LINEWORKS_CLIENT_ID!;
  const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT!;
  const privateKey = process.env.LINEWORKS_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const clientSecret = process.env.LINEWORKS_CLIENT_SECRET!;
  const scope = 'bot';

  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 3600,
    aud: 'https://auth.worksmobile.com/oauth2/v2.0/token',
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT' },
  });

  const formParams = new URLSearchParams();
  formParams.append('assertion', token);
  formParams.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  formParams.append('client_id', clientId);
  formParams.append('client_secret', clientSecret);
  formParams.append('scope', scope);

  const res = await axios.post('https://auth.worksmobile.com/oauth2/v2.0/token', formParams, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const accessToken: string | undefined = res.data?.access_token;
  const expiresIn: number = res.data?.expires_in ?? 3600;
  const expiresAt = now + expiresIn;

  if (!accessToken) {
    throw new Error('❌ access_token missing in response');
  }

  const { error } = await supabase
    .from('env_variables')
    .upsert({
      group_key: 'lineworks',
      key_name: 'access_token',
      value: accessToken,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    })
    .eq('group_key', 'lineworks')
    .eq('key_name', 'access_token');

  if (error) {
    console.error('❌ Supabaseへの保存エラー:', error);
    throw new Error('Failed to update token in Supabase');
  }

  console.log('✅ Token refreshed and saved to Supabase');
  return accessToken;
}
