// =============================================================
// src/app/api/cm/rpa/kaipoke/other-office/route.ts
// RPA 他社事業所情報 API（バルク UPSERT）
// =============================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
  cmRpaApiHandler,
  CM_RPA_SYSTEM_USER_ID,
  CM_RPA_SYSTEM_USER_NAME,
} from "@/lib/cm/rpa/cmRpaApiHandler";
import {
  cmMarkJobItemCompleted,
  cmMarkJobItemFailed,
  type CmJobItemRef,
} from "@/lib/cm/rpa/cmRpaJobItemHelper";
import { recordOperationLog } from "@/lib/cm/audit/recordOperationLog";
import { CM_OP_LOG_RPA_OTHER_OFFICE } from "@/constants/cm/operationLogActions";
import { randomUUID } from "crypto";
import { cmWithRetry } from "@/lib/cm/supabase/cmSupabaseRetry";

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

    // 監査コンテキスト設定
    const traceId = randomUUID();
    await supabaseAdmin.rpc("set_audit_context", {
      p_user_id: CM_RPA_SYSTEM_USER_ID,
      p_action: CM_OP_LOG_RPA_OTHER_OFFICE,
      p_trace_id: traceId,
    });

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

      // リトライ付き upsert
      const { error: dbError } = await cmWithRetry(
        () =>
          supabaseAdmin
            .from("cm_kaipoke_other_office")
            .upsert(upsertData, { onConflict: "kaipoke_office_id" }),
        { operationLabel: `他社事業所: UPSERT(${record.kaipoke_office_id})`, logger }
      );

      if (dbError) {
        // cmWithRetry がエラーメッセージをサニタイズ済み
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

    // 操作ログ記録
    await recordOperationLog({
      userId: CM_RPA_SYSTEM_USER_ID,
      userName: CM_RPA_SYSTEM_USER_NAME,
      action: CM_OP_LOG_RPA_OTHER_OFFICE,
      resourceType: "other-office",
      metadata: { success: successCount, fail: failCount },
      traceId,
    });

    return NextResponse.json({
      ok: true,
      success: successCount,
      fail: failCount,
    });
  }
);