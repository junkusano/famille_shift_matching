// =============================================================
// src/lib/cm/auth/getAccessToken.ts
// クライアントサイド用アクセストークン取得ユーティリティ
// =============================================================

import { supabase } from '@/lib/supabaseClient';

/**
 * Supabase セッションから JWT アクセストークンを取得
 * Server Actions の token 引数に渡す用途で使用する
 */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}
