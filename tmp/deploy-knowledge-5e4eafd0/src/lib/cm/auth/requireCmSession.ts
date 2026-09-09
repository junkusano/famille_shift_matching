// =============================================================
// src/lib/cm/auth/requireCmSession.ts
// CM用 Server Actions 認証・認可ヘルパー
//
// クライアントから渡された access_token を検証し、
// CM権限（service_type: kyotaku or both）を確認する。
//
// 内部実装は cmValidateTokenAndUser に委譲。
// このファイルは Server Actions 向けのインターフェースを提供する。
//
// 使い方:
//   import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
//
//   export async function someServerAction(token: string) {
//     try {
//       const auth = await requireCmSession(token);
//       // auth.userId, auth.authUserId, auth.serviceType が使える
//     } catch (error) {
//       if (error instanceof CmAuthError) {
//         return { ok: false, error: error.message };
//       }
//       throw error;
//     }
//   }
// =============================================================

import "server-only";

import { cmValidateTokenAndUser } from "./cmValidateTokenAndUser";
import type { CmValidatedUser } from "./cmValidateTokenAndUser";

// ---------------------------------------------------------
// Re-export: 既存の import パスを維持するため
//   import { CmAuthError } from "@/lib/cm/auth/requireCmSession"
// を壊さない
// ---------------------------------------------------------
export { CmAuthError } from "./cmValidateTokenAndUser";

// =============================================================
// 型定義
// =============================================================

/**
 * 認証成功時に返されるユーザー情報
 */
export type CmSessionInfo = {
  /** Supabase Auth の user.id（UUID） */
  authUserId: string;
  /** users テーブルの user_id（テキスト） */
  userId: string;
  /** users テーブルの service_type */
  serviceType: string;
};

// =============================================================
// メイン関数
// =============================================================

/**
 * Server Actions 用の CM認証・認可
 *
 * 1. クライアントから渡されたトークンを supabaseAdmin で検証（認証）
 * 2. users テーブルで service_type が kyotaku or both であることを確認（認可）
 *
 * @param token クライアントから渡された Supabase access_token
 * @returns ユーザー情報（CmSessionInfo）
 * @throws CmAuthError 認証・認可に失敗した場合
 */
export async function requireCmSession(token: string): Promise<CmSessionInfo> {
  const validated: CmValidatedUser = await cmValidateTokenAndUser(token);

  return {
    authUserId: validated.authUserId,
    userId: validated.userId,
    serviceType: validated.serviceType,
  };
}