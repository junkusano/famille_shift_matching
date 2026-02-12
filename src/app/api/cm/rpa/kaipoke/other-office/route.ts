// =============================================================
// src/app/api/cm/rpa/kaipoke/other-office/route.ts
// RPA 他社事業所情報 API（バルク UPSERT）
// =============================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { cmRpaApiHandler } from "@/lib/cm/rpa/cmRpaApiHandler";
import {
  cmMarkJobItemCompleted,
  cmMarkJobItemFailed,
  type CmJobItemRef,
} from "@/lib/cm/rpa/cmRpaJobItemHelper";

// =============================================================
// 型定義
// =============================================================

type OtherOfficeRecord = {
  kaipoke_office_id: string;
  service_type?: string;
  office_number?: string;
  office_name?: string;
  is_satellite?: boolean;
  phone?: string;
  fax?: string;
  address?: string;
};

type RequestBody = {
  records: OtherOfficeRecord[];
  _job?: CmJobItemRef;
};

type ApiResponse = {
  ok: boolean;
  success?: number;
  fail?: number;
  error?: string;
};

// =============================================================
// バリデーション
// =============================================================

function cmValidateOtherOfficeRecord(record: OtherOfficeRecord): string | null {
  if (!record.kaipoke_office_id) {
    return "kaipoke_office_id is required";
  }

  if (
    typeof record.kaipoke_office_id !== "string" ||
    record.kaipoke_office_id.trim() === ""
  ) {
    return "kaipoke_office_id must be a non-empty string";
  }

  if (
    record.is_satellite !== undefined &&
    typeof record.is_satellite !== "boolean"
  ) {
    return "is_satellite must be a boolean";
  }

  return null;
}

// =============================================================
// POST /api/cm/rpa/kaipoke/other-office
// =============================================================

export const POST = cmRpaApiHandler<ApiResponse>(
  "cm/api/rpa/kaipoke/other-office",
  async (request, logger) => {
    // リクエストボディ取得
    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const { records, _job: jobParam } = body;

    // records 配列チェック
    if (!records || !Array.isArray(records)) {
      return NextResponse.json(
        { ok: false, error: "records array is required" },
        { status: 400 }
      );
    }

    if (records.length === 0) {
      if (jobParam) {
        await cmMarkJobItemCompleted(jobParam);
      }
      return NextResponse.json({ ok: true, success: 0, fail: 0 });
    }

    // バルク UPSERT 処理
    let successCount = 0;
    let failCount = 0;

    for (const record of records) {
      const validationError = cmValidateOtherOfficeRecord(record);
      if (validationError) {
        logger.warn("バリデーションエラー", { error: validationError });
        failCount++;
        continue;
      }

      const upsertData = {
        kaipoke_office_id: record.kaipoke_office_id.trim(),
        service_type: record.service_type ?? null,
        office_number: record.office_number ?? null,
        office_name: record.office_name ?? null,
        is_satellite: record.is_satellite ?? false,
        phone: record.phone ?? null,
        fax: record.fax ?? null,
        address: record.address ?? null,
        updated_at: new Date().toISOString(),
      };

      const { error: dbError } = await supabaseAdmin
        .from("cm_kaipoke_other_office")
        .upsert(upsertData, { onConflict: "kaipoke_office_id" });

      if (dbError) {
        logger.error("DB upsert エラー", undefined, {
          message: dbError.message,
        });
        failCount++;
      } else {
        successCount++;
      }
    }

    // _job パラメータの処理
    if (jobParam) {
      if (successCount === 0 && failCount > 0) {
        await cmMarkJobItemFailed(
          jobParam,
          `全 ${failCount} 件の保存に失敗しました`
        );
      } else {
        // 全件成功 or 一部成功：完了扱い
        await cmMarkJobItemCompleted(jobParam);
      }
    }

    return NextResponse.json({
      ok: true,
      success: successCount,
      fail: failCount,
    });
  }
);