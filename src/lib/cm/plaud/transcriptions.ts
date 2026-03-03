// =============================================================
// src/lib/cm/plaud/transcriptions.ts
// Plaud文字起こし Server Actions（管理画面用）
//
// セキュリティ:
//   全アクションで requireCmSession(token) による認証を必須実施。
//   - クライアントから渡された access_token を検証（認証）
//   - registered_by による所有者チェック（認可）
//   - 操作ログにユーザーIDを記録（監査証跡）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { revalidatePath } from "next/cache";
import { withAuditLog } from "@/lib/cm/audit/withAuditLog";
import {
  CM_OP_LOG_PLAUD_UPDATE_CLIENT,
  CM_OP_LOG_PLAUD_EXECUTE_ACTION,
} from "@/constants/cm/operationLogActions";

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

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type PlaudTranscriptionListParams = {
  page?: number;
  limit?: number;
  status?: string;
  token: string;
};

export type PlaudTranscriptionPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

// =============================================================
// 共通: CmAuthError ハンドリング
// =============================================================

function handleActionError(
  error: unknown,
  fallbackMessage: string,
): { ok: false; error: string } {
  if (error instanceof CmAuthError) {
    return { ok: false, error: error.message };
  }
  logger.error(fallbackMessage, error as Error);
  return { ok: false, error: "サーバーエラーが発生しました" };
}

// =============================================================
// 共通: 利用者名取得
// =============================================================

async function fetchClientName(kaipokeCsId: string | null): Promise<string | null> {
  if (!kaipokeCsId) return null;

  const { data: client } = await supabaseAdmin
    .from("cm_kaipoke_info")
    .select("name")
    .eq("kaipoke_cs_id", kaipokeCsId)
    .single();

  return client?.name ?? null;
}

async function fetchClientNameMap(clientIds: string[]): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map();

  const { data: clients } = await supabaseAdmin
    .from("cm_kaipoke_info")
    .select("kaipoke_cs_id, name")
    .in("kaipoke_cs_id", clientIds);

  return new Map(
    (clients ?? []).map((c) => [c.kaipoke_cs_id, c.name]),
  );
}

// =============================================================
// 文字起こし詳細取得（読み取り専用 — 操作ログ不要）
// =============================================================

export async function getPlaudTranscription(
  id: number,
  token: string,
): Promise<ActionResult<PlaudTranscription>> {
  try {
    // requireCmSession は users テーブルの user_id を auth.userId として返す
    const auth = await requireCmSession(token);
    const userId = auth.userId;

    const { data, error } = await supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("*")
      .eq("id", id)
      .eq("registered_by", userId)
      .single();

    if (error || !data) {
      return { ok: false, error: "文字起こしデータが見つかりません" };
    }

    const clientName = await fetchClientName(data.kaipoke_cs_id);

    return {
      ok: true,
      data: { ...data, client_name: clientName } as PlaudTranscription,
    };
  } catch (error) {
    return handleActionError(error, "文字起こし詳細取得エラー");
  }
}

// =============================================================
// 文字起こし一覧取得（読み取り専用 — 操作ログ不要）
// =============================================================

export async function getPlaudTranscriptionList(
  params: PlaudTranscriptionListParams,
): Promise<ActionResult<{ transcriptions: PlaudTranscription[]; pagination: PlaudTranscriptionPagination }>> {
  try {
    // requireCmSession は users テーブルの user_id を auth.userId として返す
    const auth = await requireCmSession(params.token);

    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const status = params.status;
    const userId = auth.userId;

    logger.info("文字起こし一覧取得開始", { page, limit, status, userId });

    // クエリ構築
    let query = supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("*", { count: "exact" })
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
        .filter((id): id is string => id !== null),
    )];

    const clientMap = await fetchClientNameMap(clientIds);

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
    return handleActionError(error, "文字起こし一覧取得エラー");
  }
}

// =============================================================
// アクション実行（承認・リトライ）
// =============================================================

export async function executeTranscriptionAction(
  id: number,
  action: "approve" | "retry",
  token: string,
): Promise<ActionResult<PlaudTranscription>> {
  try {
    const auth = await requireCmSession(token);

    if (!["approve", "retry"].includes(action)) {
      return { ok: false, error: "無効なアクションです" };
    }

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_PLAUD_EXECUTE_ACTION,
        resourceType: "plaud-transcription",
        resourceId: String(id),
        metadata: { transcriptionAction: action },
      },
      async () => {
        const userId = auth.userId;

        logger.info("アクション実行開始", { id, action, userId });

        // 現在のデータ取得（ログインユーザーのデータのみ）
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

        logger.info("アクション実行完了", { id, action, userId });

        revalidatePath("/cm-portal/plaud");

        return { ok: true, data: updated as PlaudTranscription };
      },
    );
  } catch (error) {
    return handleActionError(error, "アクション実行エラー");
  }
}

// =============================================================
// 利用者紐付け更新
// =============================================================

export async function updateTranscriptionClient(
  id: number,
  kaipokeCsId: string | null,
  token: string,
): Promise<ActionResult<PlaudTranscription & { client_name: string | null }>> {
  try {
    const auth = await requireCmSession(token);

    return withAuditLog(
      {
        auth,
        action: CM_OP_LOG_PLAUD_UPDATE_CLIENT,
        resourceType: "plaud-transcription",
        resourceId: String(id),
        metadata: { kaipokeCsId },
      },
      async () => {
        const userId = auth.userId;

        logger.info("利用者紐付け更新開始", { id, kaipoke_cs_id: kaipokeCsId, userId });

        // 存在確認（ログインユーザーのデータのみ）
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

        const clientName = await fetchClientName(kaipokeCsId);

        logger.info("利用者紐付け更新完了", { id, kaipoke_cs_id: kaipokeCsId, userId });

        revalidatePath("/cm-portal/plaud");

        return {
          ok: true,
          data: {
            ...updated,
            client_name: clientName,
          } as PlaudTranscription & { client_name: string | null },
        };
      },
    );
  } catch (error) {
    return handleActionError(error, "利用者紐付け更新エラー");
  }
}