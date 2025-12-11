// src/lib/cm/types.ts

/**
 * ユーザーデータソースの種類
 */
export type UserSource = 'supabase' | 'mock' | 'kaipoke';

/**
 * ユーザー権限
 * DBの値をそのまま使用するためstring型
 */
export type CmRole = string | null;

/**
 * cm-portal用ユーザーデータ
 */
export interface CmUserData {
  /** ユーザーID */
  userId: string;
  /** 姓（漢字） */
  lastNameKanji: string;
  /** 名（漢字） */
  firstNameKanji: string;
  /** 姓（かな） */
  lastNameKana: string;
  /** 名（かな） */
  firstNameKana: string;
  /** 表示名（姓 + 名） */
  displayName: string;
  /** プロフィール画像URL */
  photoUrl: string | null;
  /** 権限（DBの値をそのまま使用） */
  role: CmRole;
  /** メールアドレス */
  email?: string;
}

/**
 * ユーザーコンテキストの値
 */
export interface CmUserContextValue {
  /** ユーザーデータ */
  user: CmUserData | null;
  /** ローディング状態 */
  loading: boolean;
  /** エラー */
  error: Error | null;
  /** データソース */
  source: UserSource;
  /** 画像を更新 */
  updatePhoto: (url: string | null) => Promise<void>;
  /** データを再取得 */
  refresh: () => Promise<void>;
}

/**
 * アダプターの共通インターフェース
 */
export interface UserAdapter {
  /** ユーザーデータを取得 */
  fetchUser: () => Promise<CmUserData | null>;
  /** 画像URLを更新 */
  updatePhotoUrl?: (userId: string, url: string | null) => Promise<void>;
}