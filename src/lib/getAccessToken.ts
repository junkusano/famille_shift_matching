//lib/getAccessToken
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function getAccessToken(): Promise<string> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SupabaseのURLまたはキーが未設定です');
  }

  const { data, error } = await supabase
    .from('env_variables')
    .select('value, expires_at')
    .eq('group_key', 'lineworks')
    .eq('key_name', 'access_token')
    .single();

  if (error) {
    console.error('Supabaseからの取得エラー:', error);
    throw new Error('AccessTokenの取得に失敗しました');
  }

  if (!data || !data.value) {
    throw new Error('AccessTokenがSupabaseに存在しません');
  }

  // 有効期限チェック（必要なら）
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error('AccessTokenが期限切れです');
  }

  return data.value;
}

