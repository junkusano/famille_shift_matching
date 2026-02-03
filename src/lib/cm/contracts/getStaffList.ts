// =============================================================
// src/lib/cm/contracts/getStaffList.ts
// 職員一覧取得（Server Action — Client Componentから呼び出し可能）
//
// 対象: service_type が kyotaku または both かつ
//       status が lineworks_kaipoke_joined のユーザー
//
// 職員名は users.entry_id → form_entries で取得
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";

const logger = createLogger("lib/cm/contracts/getStaffList");

// =============================================================
// Types
// =============================================================

export type CmStaffOption = {
  user_id: string;
  display_name: string;
};

export type GetStaffListResult =
  | { ok: true; data: CmStaffOption[] }
  | { ok: false; error: string };

// =============================================================
// 職員一覧取得
// =============================================================

export async function getStaffList(): Promise<GetStaffListResult> {
  try {
    logger.info("職員一覧取得開始");

    // ---------------------------------------------------------
    // 対象ユーザー取得
    // ---------------------------------------------------------
    const { data: usersData, error: usersError } = await supabaseAdmin
      .from("users")
      .select("user_id, entry_id")
      .in("service_type", ["kyotaku", "both"])
      .eq("status", "lineworks_kaipoke_joined");

    if (usersError) {
      logger.error("ユーザー取得エラー", { message: usersError.message });
      return { ok: false, error: usersError.message };
    }

    if (!usersData || usersData.length === 0) {
      logger.info("対象職員なし");
      return { ok: true, data: [] };
    }

    // ---------------------------------------------------------
    // form_entries から氏名取得
    // ---------------------------------------------------------
    const entryIds = usersData
      .map((u) => u.entry_id)
      .filter((id): id is string => id != null);

    if (entryIds.length === 0) {
      return { ok: true, data: [] };
    }

    const { data: entriesData, error: entriesError } = await supabaseAdmin
      .from("form_entries")
      .select("id, last_name_kanji, first_name_kanji")
      .in("id", entryIds);

    if (entriesError) {
      logger.error("form_entries取得エラー", { message: entriesError.message });
      return { ok: false, error: entriesError.message };
    }

    // ---------------------------------------------------------
    // マッピング
    // ---------------------------------------------------------
    const entryNameMap = new Map<string, string>();
    (entriesData ?? []).forEach((e) => {
      const name =
        `${e.last_name_kanji || ""} ${e.first_name_kanji || ""}`.trim();
      if (name) {
        entryNameMap.set(e.id, name);
      }
    });

    const staffList: CmStaffOption[] = [];
    usersData.forEach((u) => {
      if (u.entry_id && entryNameMap.has(u.entry_id)) {
        staffList.push({
          user_id: u.user_id,
          display_name: entryNameMap.get(u.entry_id)!,
        });
      }
    });

    // 名前順でソート
    staffList.sort((a, b) => a.display_name.localeCompare(b.display_name, "ja"));

    logger.info("職員一覧取得完了", { count: staffList.length });
    return { ok: true, data: staffList };
  } catch (e) {
    logger.error("予期せぬエラー", e as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}
