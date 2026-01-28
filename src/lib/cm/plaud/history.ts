// =============================================================
// src/lib/cm/plaud/history.ts
// Plaud処理履歴 Server Actions
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { revalidatePath } from "next/cache";

const logger = createLogger("lib/cm/plaud/history");

// =============================================================
// Types
// =============================================================

export type PlaudHistory = {
  id: number;
  transcription_id: number | null;
  template_id: number | null;
  kaipoke_cs_id: string | null;
  input_text: string | null;
  output_text: string;
  processed_at: string;
  created_at: string;
  updated_at: string;
  // 拡張フィールド
  transcription_title?: string;
  template_name?: string;
  client_name?: string | null;
};

export type PlaudHistoryPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type ActionResult<T = void> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

// =============================================================
// 処理履歴一覧取得
// =============================================================

export async function getPlaudHistoryList(params: {
  page?: number;
  limit?: number;
  transcriptionId?: number;
} = {}): Promise<ActionResult<{ history: PlaudHistory[]; pagination: PlaudHistoryPagination }>> {
  try {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const transcriptionId = params.transcriptionId;

    logger.info("処理履歴一覧取得開始", { page, limit, transcriptionId });

    // クエリ構築
    let query = supabaseAdmin
      .from("cm_plaud_mgmt_history")
      .select("*", { count: "exact" });

    if (transcriptionId) {
      query = query.eq("transcription_id", transcriptionId);
    }

    // ページネーション
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query
      .order("processed_at", { ascending: false })
      .range(from, to);

    const { data: historyData, error, count } = await query;

    if (error) {
      logger.error("取得エラー", { error: error.message });
      return { ok: false, error: "処理履歴の取得に失敗しました" };
    }

    // 関連データ取得のためのID収集
    const transcriptionIds = [...new Set(
      (historyData ?? [])
        .map((h) => h.transcription_id)
        .filter((id): id is number => id !== null)
    )];

    const templateIds = [...new Set(
      (historyData ?? [])
        .map((h) => h.template_id)
        .filter((id): id is number => id !== null)
    )];

    const clientIds = [...new Set(
      (historyData ?? [])
        .map((h) => h.kaipoke_cs_id)
        .filter((id): id is string => id !== null)
    )];

    // 文字起こしタイトル取得
    let transcriptionMap = new Map<number, string>();
    if (transcriptionIds.length > 0) {
      const { data: transcriptions } = await supabaseAdmin
        .from("cm_plaud_mgmt_transcriptions")
        .select("id, title")
        .in("id", transcriptionIds);

      transcriptionMap = new Map(
        (transcriptions ?? []).map((t) => [t.id, t.title])
      );
    }

    // テンプレート情報取得
    let templateMap = new Map<number, string>();
    if (templateIds.length > 0) {
      const { data: templates } = await supabaseAdmin
        .from("cm_plaud_mgmt_templates")
        .select("id, name")
        .in("id", templateIds);

      templateMap = new Map(
        (templates ?? []).map((t) => [t.id, t.name])
      );
    }

    // 利用者情報取得
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
    const history: PlaudHistory[] = (historyData ?? []).map((h) => {
      const templateName = h.template_id ? templateMap.get(h.template_id) : null;
      return {
        ...h,
        transcription_title: h.transcription_id
          ? transcriptionMap.get(h.transcription_id) ?? "（削除済み）"
          : "（削除済み）",
        template_name: templateName ?? "（削除済み）",
        client_name: h.kaipoke_cs_id
          ? clientMap.get(h.kaipoke_cs_id) ?? null
          : null,
      } as PlaudHistory;
    });

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    logger.info("処理履歴一覧取得完了", { count: history.length, total });

    return {
      ok: true,
      data: {
        history,
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
// 処理履歴詳細取得
// =============================================================

export async function getPlaudHistory(
  id: number
): Promise<ActionResult<PlaudHistory>> {
  try {
    const { data, error } = await supabaseAdmin
      .from("cm_plaud_mgmt_history")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return { ok: false, error: "処理履歴が見つかりません" };
    }

    // 関連データを取得
    let transcriptionTitle: string | null = null;
    let templateName: string | null = null;

    if (data.transcription_id) {
      const { data: trans } = await supabaseAdmin
        .from("cm_plaud_mgmt_transcriptions")
        .select("title")
        .eq("id", data.transcription_id)
        .single();
      transcriptionTitle = trans?.title ?? "（削除済み）";
    }

    if (data.template_id) {
      const { data: temp } = await supabaseAdmin
        .from("cm_plaud_mgmt_templates")
        .select("name")
        .eq("id", data.template_id)
        .single();
      templateName = temp?.name ?? "（削除済み）";
    }

    return {
      ok: true,
      data: {
        ...data,
        transcription_title: transcriptionTitle ?? "（削除済み）",
        template_name: templateName ?? "（削除済み）",
      } as PlaudHistory,
    };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 処理履歴作成
// =============================================================

export async function createPlaudHistory(data: {
  transcription_id: number;
  template_id: number;
  kaipoke_cs_id?: string | null;
  input_text?: string | null;
  output_text: string;
}): Promise<ActionResult<PlaudHistory>> {
  try {
    // バリデーション
    if (!data.transcription_id || !data.template_id) {
      return { ok: false, error: "文字起こしIDとテンプレートIDは必須です" };
    }

    if (!data.output_text || typeof data.output_text !== "string") {
      return { ok: false, error: "出力テキストは必須です" };
    }

    logger.info("処理履歴作成開始", {
      transcriptionId: data.transcription_id,
      templateId: data.template_id,
    });

    // 文字起こしデータ存在確認
    const { data: transcription, error: transError } = await supabaseAdmin
      .from("cm_plaud_mgmt_transcriptions")
      .select("id, transcript, kaipoke_cs_id")
      .eq("id", data.transcription_id)
      .single();

    if (transError || !transcription) {
      return { ok: false, error: "文字起こしデータが見つかりません" };
    }

    // テンプレート存在確認
    const { data: template, error: tempError } = await supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .select("id")
      .eq("id", data.template_id)
      .single();

    if (tempError || !template) {
      return { ok: false, error: "テンプレートが見つかりません" };
    }

    // kaipoke_cs_id: 指定があればそれを使用、なければ文字起こしのものを使用
    const kaipokeCsId = data.kaipoke_cs_id !== undefined
      ? data.kaipoke_cs_id
      : transcription.kaipoke_cs_id;

    // 履歴作成
    const insertData = {
      transcription_id: data.transcription_id,
      template_id: data.template_id,
      kaipoke_cs_id: kaipokeCsId,
      input_text: data.input_text ?? transcription.transcript,
      output_text: data.output_text,
      processed_at: new Date().toISOString(),
    };

    const { data: created, error: insertError } = await supabaseAdmin
      .from("cm_plaud_mgmt_history")
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      logger.error("作成エラー", { error: insertError.message });
      return { ok: false, error: "処理履歴の作成に失敗しました" };
    }

    logger.info("処理履歴作成完了", { id: created.id });

    revalidatePath("/cm-portal/plaud");

    return { ok: true, data: created as PlaudHistory };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 処理履歴更新（出力テキスト編集）
// =============================================================

export async function updatePlaudHistory(
  id: number,
  data: {
    output_text: string;
  }
): Promise<ActionResult<PlaudHistory>> {
  try {
    if (!data.output_text || typeof data.output_text !== "string") {
      return { ok: false, error: "出力テキストは必須です" };
    }

    logger.info("処理履歴更新開始", { id });

    // 存在確認
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("cm_plaud_mgmt_history")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { ok: false, error: "処理履歴が見つかりません" };
    }

    // 更新
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("cm_plaud_mgmt_history")
      .update({
        output_text: data.output_text,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      logger.error("更新エラー", { error: updateError.message });
      return { ok: false, error: "更新に失敗しました" };
    }

    logger.info("処理履歴更新完了", { id });

    revalidatePath("/cm-portal/plaud");

    return { ok: true, data: updated as PlaudHistory };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 処理履歴削除
// =============================================================

export async function deletePlaudHistory(
  id: number
): Promise<ActionResult<{ deletedId: number }>> {
  try {
    logger.info("処理履歴削除開始", { id });

    // 存在確認
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("cm_plaud_mgmt_history")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { ok: false, error: "処理履歴が見つかりません" };
    }

    // 削除実行
    const { error: deleteError } = await supabaseAdmin
      .from("cm_plaud_mgmt_history")
      .delete()
      .eq("id", id);

    if (deleteError) {
      logger.error("削除エラー", { error: deleteError.message });
      return { ok: false, error: "削除に失敗しました" };
    }

    logger.info("処理履歴削除完了", { id });

    revalidatePath("/cm-portal/plaud");

    return { ok: true, data: { deletedId: id } };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}
