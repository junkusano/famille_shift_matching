// src/lib/cm/adapters/supabaseAdapter.ts

import { supabase } from '@/lib/supabaseClient';
import type { CmUserData, UserAdapter } from '../types';

/**
 * Supabase からユーザーデータを取得するアダプター
 * portal側と同じデータソース（form_entries + users）を使用
 */
export const supabaseAdapter: UserAdapter = {
  /**
   * 認証済みユーザーのデータを取得
   */
  async fetchUser(): Promise<CmUserData | null> {
    try {
      // 1. 認証ユーザー取得
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error('Auth error:', authError);
        return null;
      }

      const authUserId = authData.user.id;

      // 2. form_entries からユーザー情報取得
      const { data: entryData, error: entryError } = await supabase
        .from('form_entries')
        .select('last_name_kanji, first_name_kanji, last_name_kana, first_name_kana, photo_url, email')
        .eq('auth_uid', authUserId)
        .single();

      if (entryError) {
        console.error('Entry fetch error:', entryError);
        return null;
      }

      // 3. users テーブルから権限取得
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('user_id, system_role')
        .eq('auth_user_id', authUserId)
        .single();

      if (userError) {
        console.error('User fetch error:', userError);
        // 権限が取れなくてもユーザー情報は返す（デフォルト権限なし）
      }

      // 4. CmUserData 形式に変換（DBの値をそのまま使用）
      return {
        userId: userData?.user_id || authUserId,
        lastNameKanji: entryData.last_name_kanji || '',
        firstNameKanji: entryData.first_name_kanji || '',
        lastNameKana: entryData.last_name_kana || '',
        firstNameKana: entryData.first_name_kana || '',
        displayName: `${entryData.last_name_kanji || ''} ${entryData.first_name_kanji || ''}`.trim(),
        photoUrl: entryData.photo_url,
        role: userData?.system_role || null,  // DBの値をそのまま使用
        email: entryData.email,
      };
    } catch (error) {
      console.error('Supabase adapter error:', error);
      return null;
    }
  },

  /**
   * プロフィール画像URLを更新
   */
  async updatePhotoUrl(userId: string, url: string | null): Promise<void> {
    const { error } = await supabase
      .from('form_entries')
      .update({ photo_url: url })
      .eq('auth_uid', userId);

    if (error) {
      throw new Error(`画像更新に失敗しました: ${error.message}`);
    }
  },
};

export default supabaseAdapter;