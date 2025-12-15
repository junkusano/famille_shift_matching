// src/lib/cm/types.ts

/**
 * ユーザー権限
 * DBの値をそのまま使用するためstring型
 */
export type CmRole = string | null;

/**
 * サービス種別
 * - kyotaku: 居宅介護支援のみ
 * - houmon_kaigo: 訪問介護のみ
 * - both: 両方
 */
export type CmServiceType = 'kyotaku' | 'houmon_kaigo' | 'both' | null;

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
  /** サービス種別（訪問介護/居宅/両方） */
  serviceType: CmServiceType;
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
  /** 画像を更新 */
  updatePhoto: (url: string | null) => Promise<void>;
  /** データを再取得 */
  refresh: () => Promise<void>;
}