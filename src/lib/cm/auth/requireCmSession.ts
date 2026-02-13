// =============================================================
// src/lib/cm/auth/requireCmSession.ts
// CM用 Server Actions 認証・認可ヘルパー（Cookieセッション版）
//
// verifyRequest.ts は Bearer トークン用（API Route向け）。
// こちらは Server Actions / Server Components 向けに
// Cookie セッションからユーザーを取得し、CM権限を検証する。
//
// 設計:
//   成功時 → CmSessionInfo を返す
//   失敗時 → CmAuthError を throw する
//
//   Server Actions の既存 try-catch 内で呼び出すことで、
//   認証エラーを自然にハンドリングできる。
//
// 使い方:
//   import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
//
//   export async function someServerAction() {
//     try {
//       const auth = await requireCmSession();
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

import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
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
 *
 * 通常の Error と区別するために専用クラスを用意。
 * catch 側で `error instanceof CmAuthError` で判定できる。
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
 * Server Actions / Server Components 用の CM認証・認可
 *
 * 1. Cookie セッションからログインユーザーを取得（認証）
 * 2. users テーブルで service_type が kyotaku or both であることを確認（認可）
 *
 * @returns ユーザー情報（CmSessionInfo）
 * @throws CmAuthError 認証・認可に失敗した場合
 */
export async function requireCmSession(): Promise<CmSessionInfo> {
  // ---------------------------------------------------------
  // 1. Cookie セッションからユーザーを取得
  // ---------------------------------------------------------
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    logger.warn("セッション認証失敗", {
      error: authError?.message ?? "ユーザー未取得",
    });
    throw new CmAuthError("ログインしてください");
  }

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