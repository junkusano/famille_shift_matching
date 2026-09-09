// =============================================================
// src/lib/cm/auth/verifyRequest.ts
// CM用 API Route 認証・認可ヘルパー
//
// Bearer トークンを検証（認証）し、
// service_type が kyotaku or both であることを確認（認可）する。
//
// 内部実装は cmValidateTokenAndUser に委譲。
// このファイルは API Route 向けのインターフェース（Result型）を提供する。
//
// 使い方:
//   import { verifyRequest } from "@/lib/cm/auth/verifyRequest";
//
//   export async function GET(req: NextRequest) {
//     const auth = await verifyRequest(req);
//     if (!auth.ok) {
//       return NextResponse.json({ error: auth.error }, { status: auth.status });
//     }
//     // auth.authUserId, auth.userId, auth.serviceType が使える
//   }
// =============================================================

import "server-only";

import type { NextRequest } from "next/server";
import {
  cmValidateTokenAndUser,
  CmAuthError,
} from "./cmValidateTokenAndUser";

// =============================================================
// 型定義
// =============================================================

/**
 * 認証成功時の結果
 *
 * 変更履歴:
 *   - `user: User` フィールドを `authUserId: string` に変更。
 *     Supabase Auth の User オブジェクト全体は不要なため簡素化。
 *     既存の呼び出し元で `auth.user.id` を参照していた箇所は
 *     `auth.authUserId` に変更すること。
 */
export type VerifySuccess = {
  ok: true;
  /** Supabase Auth の user.id（UUID） */
  authUserId: string;
  /** users テーブルの user_id（テキスト） */
  userId: string;
  /** users テーブルの service_type */
  serviceType: string;
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

// =============================================================
// メイン関数
// =============================================================

/**
 * CM側 API Route 用の認証・認可
 *
 * 1. Authorization ヘッダーから Bearer トークンを抽出
 * 2. cmValidateTokenAndUser でトークン検証 + CM権限チェック
 *
 * @param req NextRequest
 * @returns VerifyResult（成功 or 失敗）
 */
export async function verifyRequest(req: NextRequest): Promise<VerifyResult> {
  // 1. Authorization ヘッダーから Bearer トークンを取得
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];

  if (!token) {
    return { ok: false, error: "ログインしてください", status: 401 };
  }

  // 2. 共通バリデーション（トークン検証 → users → service_type）
  try {
    const validated = await cmValidateTokenAndUser(token);

    return {
      ok: true,
      authUserId: validated.authUserId,
      userId: validated.userId,
      serviceType: validated.serviceType,
    };
  } catch (error) {
    if (error instanceof CmAuthError) {
      return { ok: false, error: error.message, status: error.status };
    }
    // CmAuthError 以外の予期せぬエラー
    return { ok: false, error: "認証処理中にエラーが発生しました", status: 401 };
  }
}