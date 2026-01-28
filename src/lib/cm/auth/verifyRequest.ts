// src/lib/cm/auth/verifyRequest.ts
// CM用認証・認可ヘルパー
// - Bearer トークンを検証（認証）
// - service_type が kyotaku or both であることを確認（認可）

import "server-only";
import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/service";

/**
 * CM側で許可される service_type
 */
const CM_ALLOWED_SERVICE_TYPES = ["kyotaku", "both"];

/**
 * 認証成功時の結果
 */
export type VerifySuccess = {
  ok: true;
  user: User;
  userId: string;      // users.user_id (text)
  serviceType: string; // users.service_type
};

/**
 * 認証失敗時の結果
 */
export type VerifyFailure = {
  ok: false;
  error: string;
  status: 401 | 403;
};

/**
 * 認証結果
 */
export type VerifyResult = VerifySuccess | VerifyFailure;

/**
 * CM側API用の認証・認可
 * - Bearer トークンを検証
 * - service_type が kyotaku or both であることを確認
 *
 * @example
 * ```ts
 * import { verifyRequest } from "@/lib/cm/auth/verifyRequest";
 *
 * export async function GET(req: NextRequest) {
 *   const auth = await verifyRequest(req);
 *   if (!auth.ok) {
 *     return NextResponse.json({ error: auth.error }, { status: auth.status });
 *   }
 *
 *   // auth.user, auth.userId, auth.serviceType が使える
 *   console.log(auth.userId);      // users.user_id (text)
 *   console.log(auth.serviceType); // "kyotaku" or "both"
 * }
 * ```
 */
export async function verifyRequest(req: NextRequest): Promise<VerifyResult> {
  // 1. Authorization ヘッダーから Bearer トークンを取得
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];

  if (!token) {
    return { ok: false, error: "ログインしてください", status: 401 };
  }

  // 2. Supabase Auth でトークン検証
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return { ok: false, error: "ログインしてください", status: 401 };
  }

  // 3. users テーブルから user_id, service_type 取得
  const { data: userData, error: userError } = await supabaseAdmin
    .from("users")
    .select("user_id, service_type")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (userError) {
    return { ok: false, error: "ユーザー情報の取得に失敗しました", status: 401 };
  }

  if (!userData) {
    return { ok: false, error: "ユーザー情報が見つかりません", status: 401 };
  }

  // 4. service_type チェック（kyotaku or both のみ許可）
  if (!CM_ALLOWED_SERVICE_TYPES.includes(userData.service_type)) {
    return { ok: false, error: "このサービスへのアクセス権限がありません", status: 403 };
  }

  return {
    ok: true,
    user: authData.user,
    userId: userData.user_id,
    serviceType: userData.service_type,
  };
}