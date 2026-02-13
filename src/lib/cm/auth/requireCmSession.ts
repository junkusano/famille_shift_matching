// =============================================================
// src/lib/cm/auth/requireCmSession.ts
// CM用 Server Actions 認証・認可ヘルパー
//
// クライアントから渡された access_token を検証し、
// CM権限（service_type: kyotaku or both）を確認する。
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

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";

const logger = createLogger("cm/auth/requireCmSession");

// =============================================================
// 定数
// =============================================================

/**
 * CM側で許可される service_type（verifyRequest.ts と統一）
 */
const CM_ALLOWED_SERVICE_TYPES = ["kyotaku", "both"];

// =============================================================
// エラークラス
// =============================================================

/**
 * CM認証・認可エラー
 */
export class CmAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmAuthError";
  }
}

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
  // ---------------------------------------------------------
  // 1. トークン検証
  // ---------------------------------------------------------
  if (!token) {
    logger.warn("セッション認証失敗", { error: "トークンなし" });
    throw new CmAuthError("ログインしてください");
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);

  if (authError || !authData?.user) {
    logger.warn("セッション認証失敗", {
      error: authError?.message ?? "ユーザー未取得",
    });
    throw new CmAuthError("ログインしてください");
  }

  const user = authData.user;

  // ---------------------------------------------------------
  // 2. users テーブルから user_id, service_type を取得
  // ---------------------------------------------------------
  const { data: userData, error: userError } = await supabaseAdmin
    .from("users")
    .select("user_id, service_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (userError) {
    logger.error("ユーザー情報取得エラー", {
      authUserId: user.id,
      error: userError.message,
    });
    throw new CmAuthError("ユーザー情報の取得に失敗しました");
  }

  if (!userData) {
    logger.warn("ユーザー情報が見つからない", { authUserId: user.id });
    throw new CmAuthError("ユーザー情報が見つかりません");
  }

  // ---------------------------------------------------------
  // 3. service_type チェック（kyotaku or both のみ許可）
  // ---------------------------------------------------------
  if (!CM_ALLOWED_SERVICE_TYPES.includes(userData.service_type)) {
    logger.warn("CM権限なし", {
      authUserId: user.id,
      userId: userData.user_id,
      serviceType: userData.service_type,
    });
    throw new CmAuthError("このサービスへのアクセス権限がありません");
  }

  return {
    authUserId: user.id,
    userId: userData.user_id,
    serviceType: userData.service_type,
  };
}