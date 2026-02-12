// =============================================================
// src/app/api/cm/rpa/kaipoke/staff-info/route.ts
// RPA スタッフ情報 API
//
// POST /api/cm/rpa/kaipoke/staff-info
//   - カイポケスタッフID（staff_member_internal_id）を
//     usersテーブルのkaipoke_user_idに設定する
//   - login_id（カイポケログインID）でuser_idをマッチング
//   - service_type が 'kyotaku' または 'both' のユーザーのみ対象
// =============================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { cmRpaApiHandler } from "@/lib/cm/rpa/cmRpaApiHandler";

// =============================================================
// 型定義
// =============================================================

type RequestBody = {
  record: {
    /** カイポケスタッフID（内部ID） */
    staff_member_internal_id: string;
    /** カイポケログインID */
    login_id: string;
  };
};

type ApiResponse = {
  ok: boolean;
  updated: number;
  skipped: number;
  error?: string;
};

// =============================================================
// POST /api/cm/rpa/kaipoke/staff-info
// =============================================================

export const POST = cmRpaApiHandler<ApiResponse>(
  "cm/api/rpa/kaipoke/staff-info",
  async (request, logger) => {
    // リクエストボディ取得
    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, updated: 0, skipped: 0, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    // バリデーション
    if (!body.record) {
      return NextResponse.json(
        { ok: false, updated: 0, skipped: 0, error: "record is required" },
        { status: 400 }
      );
    }

    const { staff_member_internal_id, login_id } = body.record;

    if (
      !staff_member_internal_id ||
      typeof staff_member_internal_id !== "string"
    ) {
      return NextResponse.json(
        {
          ok: false,
          updated: 0,
          skipped: 0,
          error: "staff_member_internal_id is required",
        },
        { status: 400 }
      );
    }

    if (!login_id || typeof login_id !== "string") {
      return NextResponse.json(
        { ok: false, updated: 0, skipped: 0, error: "login_id is required" },
        { status: 400 }
      );
    }

    logger.info("スタッフ情報更新開始", {
      staff_member_internal_id,
      login_id,
    });

    // usersテーブルを更新
    // user_id = login_id かつ service_type が 'kyotaku' または 'both' のレコードを更新
    const { data, error } = await supabaseAdmin
      .from("users")
      .update({
        kaipoke_user_id: staff_member_internal_id,
      })
      .eq("user_id", login_id)
      .in("service_type", ["kyotaku", "both"])
      .select("user_id");

    if (error) {
      logger.error("スタッフ情報更新エラー", undefined, {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        staff_member_internal_id,
        login_id,
      });
      return NextResponse.json(
        { ok: false, updated: 0, skipped: 0, error: "Database error" },
        { status: 500 }
      );
    }

    const updatedCount = data?.length ?? 0;
    const skippedCount = updatedCount === 0 ? 1 : 0;

    if (updatedCount > 0) {
      logger.info("スタッフ情報更新完了", {
        staff_member_internal_id,
        login_id,
        updated: updatedCount,
      });
    } else {
      logger.info("スタッフ情報更新対象なし", {
        staff_member_internal_id,
        login_id,
      });
    }

    return NextResponse.json({
      ok: true,
      updated: updatedCount,
      skipped: skippedCount,
    });
  }
);