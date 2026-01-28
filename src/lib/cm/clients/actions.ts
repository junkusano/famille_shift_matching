// =============================================================
// src/lib/cm/clients/actions.ts
// 利用者関連 Server Actions（Client Componentから呼び出し可能）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";

const logger = createLogger("lib/cm/clients/actions");

// =============================================================
// Types
// =============================================================

export type ClientSearchResult = {
  id: string;
  kaipoke_cs_id: string | null;
  name: string;
  kana: string | null;
  birth_date: string | null;
  is_active: boolean;
};

export type ActionResult<T = void> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

// =============================================================
// 利用者検索（Client Componentから呼び出し可能）
// =============================================================

export async function searchClients(params: {
  search: string;
  status?: "active" | "inactive" | "all";
  limit?: number;
}): Promise<ActionResult<ClientSearchResult[]>> {
  try {
    const { search, status = "active", limit = 50 } = params;

    if (!search.trim()) {
      return { ok: true, data: [] };
    }

    logger.info("利用者検索開始", { search, status });

    let query = supabaseAdmin
      .from("cm_kaipoke_info")
      .select("id, kaipoke_cs_id, name, kana, birth_date, is_active")
      .limit(limit);

    // ステータスフィルター
    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }

    // 検索条件（名前、カナ、カイポケID）
    const searchTerm = `%${search}%`;
    query = query.or(`name.ilike.${searchTerm},kana.ilike.${searchTerm},kaipoke_cs_id.ilike.${searchTerm}`);

    // ソート
    query = query.order("kana", { ascending: true, nullsFirst: false });

    const { data, error } = await query;

    if (error) {
      logger.error("検索エラー", { error: error.message });
      return { ok: false, error: "検索に失敗しました" };
    }

    logger.info("利用者検索完了", { count: data?.length ?? 0 });

    return { ok: true, data: (data ?? []) as ClientSearchResult[] };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}