// =============================================================
// src/lib/cm/plaud/transcriptions.ts
// Plaud文字起こし Server Actions（管理画面用）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { revalidatePath } from "next/cache";

const logger = createLogger("lib/cm/plaud/transcriptions");

// =============================================================
// Types
// =============================================================

export type PlaudTranscription = {
  id: number;
  plaud_uuid: string;
  title: string;
  transcript: string | null;
  kaipoke_cs_id: string | null;
  status: "pending" | "approved" | "completed" | "failed";
  retry_count: number;
  plaud_created_at: string;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
  // 拡張フィールド
  client_name?: string | null;
};

export type ActionResult<T = void> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

// =============================================================
// ★ 追加: auth_user_id から user_id を取得するヘルパー
// =============================================================

async function getUserIdFromAuthUserId(authUserId: string): Promise<string | null> {
  try {
    const { data: userData, error } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("auth_user_id", authUserId)
      .single();

    if (error || !userData) {
      logger.warn("ユーザー情報取得失敗", { authUserId, error: error?.message });
      return null;
    }

    return userData.user_id;
  } catch (error) {
    logger.error("getUserIdFromAuthUserId エラー", error as Error);
    return null;
  }
}

// =============================================================
// 文字起こし詳細取得
// ★ 修正: authUserId パラメータ追加、ログインユーザーのデータのみ取得
// =============================================================

export async function getPlaudTranscription(
  id: number,
  authUserId: string
): Promise<ActionResult<PlaudTranscription>> {
  try {
    // ★ auth_user_id から user_id を取得
    const userId = await getUserIdFromAuthUserId(authUserId);
    if (!userId) {
      return { ok: false, error: "認証情報を取得できませんでした" };
    }

    const { data, error } = await supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("*")
      .eq("id", id)
      // ★ ログインユーザーのデータのみ取得
      .eq("registered_by", userId)
      .single();

    if (error || !data) {
      return { ok: false, error: "文字起こしデータが見つかりません" };
    }

    // 利用者名を取得
    let clientName: string | null = null;
    if (data.kaipoke_cs_id) {
      const { data: client } = await supabaseAdmin
        .from("cm_kaipoke_info")
        .select("name")
        .eq("kaipoke_cs_id", data.kaipoke_cs_id)
        .single();
      clientName = client?.name ?? null;
    }

    return {
      ok: true,
      data: {
        ...data,
        client_name: clientName,
      } as PlaudTranscription,
    };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 文字起こし一覧取得（管理画面用）
// ★ 修正: authUserId パラメータ追加、ログインユーザーのデータのみ取得
// =============================================================

export type PlaudTranscriptionListParams = {
  page?: number;
  limit?: number;
  status?: string;
  authUserId: string; // ★ 追加: 必須パラメータ
};

export type PlaudTranscriptionPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export async function getPlaudTranscriptionList(
  params: PlaudTranscriptionListParams
): Promise<ActionResult<{ transcriptions: PlaudTranscription[]; pagination: PlaudTranscriptionPagination }>> {
  try {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const status = params.status;
    const authUserId = params.authUserId;

    // ★ auth_user_id から user_id を取得
    const userId = await getUserIdFromAuthUserId(authUserId);
    if (!userId) {
      logger.warn("ログインユーザー情報が取得できません", { authUserId });
      return { ok: false, error: "認証情報を取得できませんでした。再度ログインしてください。" };
    }

    logger.info("文字起こし一覧取得開始", { page, limit, status, userId });

    // クエリ構築
    let query = supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("*", { count: "exact" })
      // ★ ログインユーザーのデータのみ取得
      .eq("registered_by", userId);

    if (status) {
      query = query.eq("status", status);
    }

    // ページネーション
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query
      .order("plaud_created_at", { ascending: false })
      .range(from, to);

    const { data: transcriptionData, error, count } = await query;

    if (error) {
      logger.error("取得エラー", { error: error.message });
      return { ok: false, error: "文字起こし一覧の取得に失敗しました" };
    }

    // 利用者情報取得
    const clientIds = [...new Set(
      (transcriptionData ?? [])
        .map((t) => t.kaipoke_cs_id)
        .filter((id): id is string => id !== null)
    )];

    let clientMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabaseAdmin
        .from("cm_kaipoke_info")
        .select("kaipoke_cs_id, name")
        .in("kaipoke_cs_id", clientIds);

      clientMap = new Map(
        (clients ?? []).map((c) => [c.kaipoke_cs_id, c.name])
      );
    }

    // 結果構築
    const transcriptions: PlaudTranscription[] = (transcriptionData ?? []).map((t) => ({
      ...t,
      client_name: t.kaipoke_cs_id
        ? clientMap.get(t.kaipoke_cs_id) ?? null
        : null,
    } as PlaudTranscription));

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    logger.info("文字起こし一覧取得完了", { count: transcriptions.length, total, userId });

    return {
      ok: true,
      data: {
        transcriptions,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// アクション実行（承認・リトライ）
// ★ 修正: authUserId パラメータ追加、ログインユーザーのデータのみ操作可能
// =============================================================

export async function executeTranscriptionAction(
  id: number,
  action: "approve" | "retry",
  authUserId: string
): Promise<ActionResult<PlaudTranscription>> {
  try {
    if (!["approve", "retry"].includes(action)) {
      return { ok: false, error: "無効なアクションです" };
    }

    // ★ auth_user_id から user_id を取得
    const userId = await getUserIdFromAuthUserId(authUserId);
    if (!userId) {
      return { ok: false, error: "認証情報を取得できませんでした" };
    }

    logger.info("アクション実行開始", { id, action, userId });

    // 現在のデータ取得（★ ログインユーザーのデータのみ）
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("*")
      .eq("id", id)
      .eq("registered_by", userId)
      .single();

    if (fetchError || !current) {
      return { ok: false, error: "文字起こしデータが見つかりません" };
    }

    // アクション実行
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (action === "approve") {
      if (current.status !== "pending") {
        return { ok: false, error: "待機中のデータのみ承認できます" };
      }
      updateData.status = "approved";
    } else if (action === "retry") {
      if (current.status !== "failed") {
        return { ok: false, error: "エラー状態のデータのみリトライできます" };
      }
      updateData.status = "approved";
      updateData.retry_count = 0;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .update(updateData)
      .eq("id", id)
      .eq("registered_by", userId)
      .select()
      .single();

    if (updateError) {
      logger.error("更新エラー", { error: updateError.message });
      return { ok: false, error: "更新に失敗しました" };
    }

    logger.info("アクション実行完了", { id, action });

    revalidatePath("/cm-portal/plaud");

    return { ok: true, data: updated as PlaudTranscription };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 利用者紐付け更新
// ★ 修正: authUserId パラメータ追加、ログインユーザーのデータのみ操作可能
// =============================================================

export async function updateTranscriptionClient(
  id: number,
  kaipokeCsId: string | null,
  authUserId: string
): Promise<ActionResult<PlaudTranscription & { client_name: string | null }>> {
  try {
    // ★ auth_user_id から user_id を取得
    const userId = await getUserIdFromAuthUserId(authUserId);
    if (!userId) {
      return { ok: false, error: "認証情報を取得できませんでした" };
    }

    logger.info("利用者紐付け更新開始", { id, kaipoke_cs_id: kaipokeCsId, userId });

    // 存在確認（★ ログインユーザーのデータのみ）
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("id")
      .eq("id", id)
      .eq("registered_by", userId)
      .single();

    if (fetchError || !current) {
      return { ok: false, error: "文字起こしデータが見つかりません" };
    }

    // 更新
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .update({
        kaipoke_cs_id: kaipokeCsId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("registered_by", userId)
      .select()
      .single();

    if (updateError || !updated) {
      logger.error("更新エラー", { error: updateError?.message });
      return { ok: false, error: "更新に失敗しました" };
    }

    // 利用者名を取得
    let clientName: string | null = null;
    if (kaipokeCsId) {
      const { data: client } = await supabaseAdmin
        .from("cm_kaipoke_info")
        .select("name")
        .eq("kaipoke_cs_id", kaipokeCsId)
        .single();
      clientName = client?.name ?? null;
    }

    logger.info("利用者紐付け更新完了", { id, kaipoke_cs_id: kaipokeCsId });

    revalidatePath("/cm-portal/plaud");

    return {
      ok: true,
      data: {
        ...updated,
        client_name: clientName,
      } as PlaudTranscription & { client_name: string | null },
    };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}