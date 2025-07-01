import axios from 'axios';

export async function refreshLineworksAccessTokenToSupabase() {
  try {
    const {
      LINEWORKS_CLIENT_ID,
      LINEWORKS_CLIENT_SECRET,
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY
    } = process.env;

    if (!LINEWORKS_CLIENT_ID || !LINEWORKS_CLIENT_SECRET) {
      throw new Error('LINEWORKS_CLIENT_ID または CLIENT_SECRET が未設定です');
    }

    // アクセストークン取得
    const tokenRes = await axios.post(
      'https://auth.worksmobile.com/oauth2/v2.0/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: LINEWORKS_CLIENT_ID,
        client_secret: LINEWORKS_CLIENT_SECRET,
        scope: 'bot'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;
    const expiresIn = tokenRes.data.expires_in;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log('[✅取得成功] AccessToken:', accessToken);

    // Supabaseに保存
    const payload = {
      value: accessToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    };

    const supabaseUrl = `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/env_variables?group_key=eq.lineworks&key_name=eq.access_token`;

    const supabaseRes = await axios.patch(supabaseUrl, payload, {
      headers: {
        apikey: NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[✅保存成功] Supabase レスポンス:', supabaseRes.status);
  } catch (err) {
    console.error('[❌エラー] トークン更新失敗:', err.response?.data || err.message);
  }
}
