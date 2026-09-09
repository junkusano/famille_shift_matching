// =============================================================
// src/lib/cm/auth/cmValidateTokenAndUser.ts
// CM認証・認可の共通内部ロジック
//
// requireCmSession（Server Actions用）と verifyRequest（API Route用）の
// 両方から呼ばれる共通バリデーション関数。
//
// このファイル自体は外部に公開しない内部モジュール。
// 認証ヘルパーとして使う場合は requireCmSession または verifyRequest を使うこと。
//
// ※ import "server-only" は付けない。
//   呼び出し元（requireCmSession.ts, verifyRequest.ts）が既に
//   import "server-only" を持っており、このファイル単体で
//   直接 import されることは想定しない。
//   また "server-only" を付けると Next.js のモジュール解析で
//   re-export チェーンが正しく解決されない場合がある。
// =============================================================

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { CM_ALLOWED_SERVICE_TYPES } from "@/constants/cm/auth";

const logger = createLogger("cm/auth/cmValidateTokenAndUser");

// =============================================================
// エラークラス
// =============================================================

/**
 * CM認証・認可エラー
 *
 * Server Actions では catch して `{ ok: false, error: message }` に変換、
 * API Route では catch して `NextResponse.json({ error }, { status })` に変換する。
 */
export class CmAuthError extends Error {
  /** HTTP ステータスコード（API Route でのレスポンス用） */
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = "CmAuthError";
    this.status = status;
  }
}

// =============================================================
// 型定義
// =============================================================

/**
 * バリデーション成功時に返されるユーザー情報
 *
 * requireCmSession と verifyRequest が必要とする情報の和集合。
 */
export type CmValidatedUser = {
  /** Supabase Auth の user.id（UUID） */
  authUserId: string;
  /** users テーブルの user_id（テキスト） */
  userId: string;
  /** users テーブルの service_type */
  serviceType: string;
};

// =============================================================
// 共通バリデーション関数
// =============================================================

/**
 * トークンを検証し、CM権限を持つユーザーであることを確認する
 *
 * 処理フロー:
 *   1. Supabase Auth でトークン検証（認証）
 *   2. users テーブルから user_id, service_type を取得
 *   3. service_type が kyotaku or both であることを確認（認可）
 *
 * @param token Supabase access_token（JWT）
 * @returns バリデーション済みユーザー情報
 * @throws CmAuthError 認証・認可に失敗した場合
 */
export async function cmValidateTokenAndUser(token: string): Promise<CmValidatedUser> {
  // ---------------------------------------------------------
  // 1. トークン検証
  // ---------------------------------------------------------
  if (!token) {
    logger.warn("セッション認証失敗", { error: "トークンなし" });
    throw new CmAuthError("ログインしてください", 401);
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.getUser(token);

  if (authError || !authData?.user) {
    logger.warn("セッション認証失敗", {
      error: authError?.message ?? "ユーザー未取得",
    });
    throw new CmAuthError("ログインしてください", 401);
  }

  const authUser = authData.user;

  // ---------------------------------------------------------
  // 2. users テーブルから user_id, service_type を取得
  // ---------------------------------------------------------
  const { data: userData, error: userError } = await supabaseAdmin
    .from("users")
    .select("user_id, service_type")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (userError) {
    logger.error("ユーザー情報取得エラー", {
      authUserId: authUser.id,
      error: userError.message,
    });
    throw new CmAuthError("ユーザー情報の取得に失敗しました", 401);
  }

  if (!userData) {
    logger.warn("ユーザー情報が見つからない", { authUserId: authUser.id });
    throw new CmAuthError("ユーザー情報が見つかりません", 401);
  }

  // ---------------------------------------------------------
  // 3. service_type チェック（kyotaku or both のみ許可）
  // ---------------------------------------------------------
  const allowed: readonly string[] = CM_ALLOWED_SERVICE_TYPES;
  if (!allowed.includes(userData.service_type)) {
    logger.warn("CM権限なし", {
      authUserId: authUser.id,
      userId: userData.user_id,
      serviceType: userData.service_type,
    });
    throw new CmAuthError("このサービスへのアクセス権限がありません", 403);
  }

  return {
    authUserId: authUser.id,
    userId: userData.user_id,
    serviceType: userData.service_type,
  };
}