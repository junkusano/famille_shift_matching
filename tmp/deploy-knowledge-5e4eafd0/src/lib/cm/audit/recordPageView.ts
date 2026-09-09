// =============================================================
// src/lib/cm/audit/recordPageView.ts
// audit.page_views にページ遷移を1件記録する Server Action
// CmPageViewTracker から fire-and-forget で呼ばれる
// 前提: Supabase Dashboard → API Settings → Exposed schemas に audit を追加済み
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { requireCmSession } from "@/lib/cm/auth/requireCmSession";

const logger = createLogger("lib/cm/audit/recordPageView");

/**
 * ページ遷移を audit.page_views に記録する
 *
 * - エラー時は例外を投げず、ログ記録のみで処理を継続する
 *   （ページ遷移記録の失敗でユーザー操作をブロックしてはいけない）
 */
export async function recordPageView(
  params: { path: string; sessionId?: string },
  token: string
): Promise<void> {
  try {
    const auth = await requireCmSession(token);

    const { error } = await supabaseAdmin
      .schema("audit")
      .from("page_views")
      .insert({
        user_id: auth.authUserId,
        path: params.path,
        session_id: params.sessionId ?? null,
      });

    if (error) {
      logger.error("page_views INSERT失敗", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }
  } catch (e) {
    logger.error(
      "recordPageView例外",
      e instanceof Error ? e : undefined
    );
  }
}