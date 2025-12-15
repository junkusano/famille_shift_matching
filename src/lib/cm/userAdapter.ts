// src/lib/cm/userAdapter.ts

import { supabase } from '@/lib/supabaseClient';
import type { CmUserData, CmServiceType } from './types';
import { createLogger } from '@/lib/common/logger';

const logger = createLogger('lib/cm/userAdapter');

/**
 * 認証済みユーザーのデータを取得
 */
export async function fetchCmUser(): Promise<CmUserData | null> {
  try {
    // 1. 認証ユーザー取得
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      logger.error('認証ユーザー取得エラー', authError);
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
      logger.error('form_entries取得エラー', entryError, { authUserId });
      return null;
    }

    // 3. users テーブルから権限とサービス種別を取得
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_id, system_role, service_type')
      .eq('auth_user_id', authUserId)
      .single();

    if (userError) {
      logger.warn('usersテーブル取得エラー（権限なしで続行）', { authUserId, error: userError.message });
      // 権限が取れなくてもユーザー情報は返す（デフォルト権限なし）
    }

    // 4. CmUserData 形式に変換
    return {
      userId: userData?.user_id || authUserId,
      lastNameKanji: entryData.last_name_kanji || '',
      firstNameKanji: entryData.first_name_kanji || '',
      lastNameKana: entryData.last_name_kana || '',
      firstNameKana: entryData.first_name_kana || '',
      displayName: `${entryData.last_name_kanji || ''} ${entryData.first_name_kanji || ''}`.trim(),
      photoUrl: entryData.photo_url,
      role: userData?.system_role || null,
      email: entryData.email,
      serviceType: (userData?.service_type as CmServiceType) || null,
    };
  } catch (error) {
    logger.error('fetchCmUser 予期せぬエラー', error);
    return null;
  }
}

/**
 * プロフィール画像URLを更新
 */
export async function updateCmUserPhoto(userId: string, url: string | null): Promise<void> {
  // auth_uid で更新するため、認証ユーザーIDを取得
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    throw new Error('認証されていません');
  }

  const { error } = await supabase
    .from('form_entries')
    .update({ photo_url: url })
    .eq('auth_uid', authData.user.id);

  if (error) {
    logger.error('画像更新に失敗', error, { userId });
    throw new Error(`画像更新に失敗しました: ${error.message}`);
  }

  logger.info('プロフィール画像を更新', { userId, hasUrl: url !== null });
}