// =============================================================
// src/lib/cm/plaud/templates.ts
// Plaudテンプレート Server Actions
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { revalidatePath } from "next/cache";

const logger = createLogger("lib/cm/plaud/templates");

// =============================================================
// Types
// =============================================================

export type PlaudTemplate = {
  id: number;
  name: string;
  description: string | null;
  system_prompt: string | null;
  user_prompt_template: string;
  output_format: string;
  options: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ActionResult<T = void> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

// =============================================================
// テンプレート一覧取得
// =============================================================

export async function getPlaudTemplates(
  activeOnly: boolean = true
): Promise<ActionResult<PlaudTemplate[]>> {
  try {
    logger.info("テンプレート一覧取得開始", { activeOnly });

    let query = supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .select("*")
      .order("sort_order", { ascending: true });

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("取得エラー", { error: error.message });
      return { ok: false, error: "テンプレートの取得に失敗しました" };
    }

    logger.info("テンプレート一覧取得完了", { count: data?.length ?? 0 });

    return { ok: true, data: (data ?? []) as PlaudTemplate[] };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// テンプレート詳細取得
// =============================================================

export async function getPlaudTemplate(
  id: number
): Promise<ActionResult<PlaudTemplate>> {
  try {
    const { data, error } = await supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return { ok: false, error: "テンプレートが見つかりません" };
    }

    return { ok: true, data: data as PlaudTemplate };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// テンプレート作成
// =============================================================

export async function createPlaudTemplate(data: {
  name: string;
  description?: string | null;
  system_prompt?: string | null;
  user_prompt_template: string;
  is_active?: boolean;
  sort_order?: number;
}): Promise<ActionResult<PlaudTemplate>> {
  try {
    // バリデーション
    if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
      return { ok: false, error: "テンプレート名は必須です" };
    }

    if (!data.user_prompt_template || typeof data.user_prompt_template !== "string") {
      return { ok: false, error: "ユーザープロンプトテンプレートは必須です" };
    }

    logger.info("テンプレート作成開始", { name: data.name });

    // sort_orderが指定されていない場合は最大値+1
    let sortOrder = data.sort_order;
    if (sortOrder === undefined) {
      const { data: maxSort } = await supabaseAdmin
        .from("cm_plaud_mgmt_templates")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();

      sortOrder = (maxSort?.sort_order ?? 0) + 1;
    }

    const insertData = {
      name: data.name.trim(),
      description: data.description?.trim() ?? null,
      system_prompt: data.system_prompt?.trim() ?? null,
      user_prompt_template: data.user_prompt_template,
      is_active: data.is_active ?? true,
      sort_order: sortOrder,
      output_format: "text",
      options: {},
    };

    const { data: created, error } = await supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error("作成エラー", { error: error.message });
      return { ok: false, error: "テンプレートの作成に失敗しました" };
    }

    logger.info("テンプレート作成完了", { id: created.id });

    revalidatePath("/cm-portal/plaud");

    return { ok: true, data: created as PlaudTemplate };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// テンプレート更新
// =============================================================

export async function updatePlaudTemplate(
  id: number,
  data: {
    name?: string;
    description?: string | null;
    system_prompt?: string | null;
    user_prompt_template?: string;
    is_active?: boolean;
    sort_order?: number;
  }
): Promise<ActionResult<PlaudTemplate>> {
  try {
    logger.info("テンプレート更新開始", { id });

    // 存在確認
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { ok: false, error: "テンプレートが見つかりません" };
    }

    // 更新データ構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) {
      if (typeof data.name !== "string" || data.name.trim() === "") {
        return { ok: false, error: "テンプレート名は空にできません" };
      }
      updateData.name = data.name.trim();
    }

    if (data.description !== undefined) {
      updateData.description = data.description?.trim() ?? null;
    }

    if (data.system_prompt !== undefined) {
      updateData.system_prompt = data.system_prompt?.trim() ?? null;
    }

    if (data.user_prompt_template !== undefined) {
      if (typeof data.user_prompt_template !== "string" || data.user_prompt_template.trim() === "") {
        return { ok: false, error: "ユーザープロンプトテンプレートは空にできません" };
      }
      updateData.user_prompt_template = data.user_prompt_template;
    }

    if (data.is_active !== undefined) {
      updateData.is_active = data.is_active;
    }

    if (data.sort_order !== undefined) {
      updateData.sort_order = data.sort_order;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      logger.error("更新エラー", { error: updateError.message });
      return { ok: false, error: "更新に失敗しました" };
    }

    logger.info("テンプレート更新完了", { id });

    revalidatePath("/cm-portal/plaud");

    return { ok: true, data: updated as PlaudTemplate };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// テンプレート削除
// =============================================================

export async function deletePlaudTemplate(
  id: number
): Promise<ActionResult<{ deletedId: number }>> {
  try {
    logger.info("テンプレート削除開始", { id });

    // 存在確認
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { ok: false, error: "テンプレートが見つかりません" };
    }

    // 削除実行
    const { error: deleteError } = await supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .delete()
      .eq("id", id);

    if (deleteError) {
      logger.error("削除エラー", { error: deleteError.message });
      return { ok: false, error: "削除に失敗しました" };
    }

    logger.info("テンプレート削除完了", { id });

    revalidatePath("/cm-portal/plaud");

    return { ok: true, data: { deletedId: id } };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}
