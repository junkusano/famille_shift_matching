// =============================================================
// src/types/cm/portalUser.ts
// CMポータルユーザー関連の共有型定義
//
// CmUserContext / useCmUser / userAdapter の3層で共有される型。
// 元 lib/cm/types.ts から責務分離して移動。
//
// 変更履歴:
//   2026-02-19: lib/cm/types.ts から分離・移動（CS-08）
//               CmUserContextValue はローカル型として
//               context/cm/CmUserContext.tsx に移動
// =============================================================

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
