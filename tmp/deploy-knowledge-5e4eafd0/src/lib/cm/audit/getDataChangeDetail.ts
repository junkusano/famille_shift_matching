// =============================================================
// src/lib/cm/audit/getDataChangeDetail.ts
// DB変更ログの詳細取得（遅延読み込み用）
//
// タイムライン一覧では old_data / new_data を除外して取得し、
// ユーザーが「詳細を表示」をクリックした際に本関数で1件ずつ取得する。
// これにより Supabase Nano プラン（512MB）でのメモリ消費を削減する。
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { createLogger } from "@/lib/common/logger";
import type { CmDataChangeLog } from "@/types/cm/operationLog";

const logger = createLogger("lib/cm/audit/getDataChangeDetail");

// =============================================================
// 型定義
// =============================================================

type GetDataChangeDetailResult = {
  ok: boolean;
  data: CmDataChangeLog | null;
  error?: string;
};

// =============================================================
// メイン関数
// =============================================================

/**
 * audit.data_change_logs から id 指定で1件取得する（old_data / new_data を含む）
 *
 * - タイムライン一覧では old_data / new_data を除外して取得しているため、
 *   詳細表示時に本関数で遅延読み込みする
 * - token 必須（requireCmSession による認証）
 */
export async function cmGetDataChangeDetail(
  id: number,
  token: string
): Promise<GetDataChangeDetailResult> {
  try {
    await requireCmSession(token);
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, data: null, error: e.message };
    }
    throw e;
  }

  try {
    const { data, error } = await supabaseAdmin
      .schema("audit")
      .from("data_change_logs")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error("DB変更ログ詳細取得エラー", undefined, { error: error.message, id });
      return { ok: false, data: null, error: "データ取得に失敗しました" };
    }

    if (!data) {
      return { ok: false, data: null, error: "該当するレコードが見つかりません" };
    }

    return { ok: true, data: data as CmDataChangeLog };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, data: null, error: "サーバーエラーが発生しました" };
  }
}