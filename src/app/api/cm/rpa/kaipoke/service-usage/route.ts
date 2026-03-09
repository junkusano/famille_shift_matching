// =============================================================
// src/app/api/cm/rpa/kaipoke/service-usage/route.ts
// RPA サービス利用情報 API（バルク）
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
import { CM_OP_LOG_RPA_SERVICE_USAGE } from "@/constants/cm/operationLogActions";
import { randomUUID } from "crypto";

// =============================================================
// 型定義
// =============================================================

type ServiceUsageRecord = {
  plan_achievement_details_id: string;
  kaipoke_cs_id?: string | null;
  service_year_month?: string | null;
  service_name?: string | null;
  service_time_start?: string | null;
  service_time_end?: string | null;
  office_name_display?: string | null;
  service_plant_value?: string | null;
  service_plant_text?: string | null;
  office_number?: string | null;
  plan_day_01?: string | null;
  plan_day_02?: string | null;
  plan_day_03?: string | null;
  plan_day_04?: string | null;
  plan_day_05?: string | null;
  plan_day_06?: string | null;
  plan_day_07?: string | null;
  plan_day_08?: string | null;
  plan_day_09?: string | null;
  plan_day_10?: string | null;
  plan_day_11?: string | null;
  plan_day_12?: string | null;
  plan_day_13?: string | null;
  plan_day_14?: string | null;
  plan_day_15?: string | null;
  plan_day_16?: string | null;
  plan_day_17?: string | null;
  plan_day_18?: string | null;
  plan_day_19?: string | null;
  plan_day_20?: string | null;
  plan_day_21?: string | null;
  plan_day_22?: string | null;
  plan_day_23?: string | null;
  plan_day_24?: string | null;
  plan_day_25?: string | null;
  plan_day_26?: string | null;
  plan_day_27?: string | null;
  plan_day_28?: string | null;
  plan_day_29?: string | null;
  plan_day_30?: string | null;
  plan_day_31?: string | null;
  plan_total?: number | null;
  actual_day_01?: string | null;
  actual_day_02?: string | null;
  actual_day_03?: string | null;
  actual_day_04?: string | null;
  actual_day_05?: string | null;
  actual_day_06?: string | null;
  actual_day_07?: string | null;
  actual_day_08?: string | null;
  actual_day_09?: string | null;
  actual_day_10?: string | null;
  actual_day_11?: string | null;
  actual_day_12?: string | null;
  actual_day_13?: string | null;
  actual_day_14?: string | null;
  actual_day_15?: string | null;
  actual_day_16?: string | null;
  actual_day_17?: string | null;
  actual_day_18?: string | null;
  actual_day_19?: string | null;
  actual_day_20?: string | null;
  actual_day_21?: string | null;
  actual_day_22?: string | null;
  actual_day_23?: string | null;
  actual_day_24?: string | null;
  actual_day_25?: string | null;
  actual_day_26?: string | null;
  actual_day_27?: string | null;
  actual_day_28?: string | null;
  actual_day_29?: string | null;
  actual_day_30?: string | null;
  actual_day_31?: string | null;
  actual_total?: number | null;
};

type BulkRequest = {
  records: ServiceUsageRecord[];
  _job?: CmJobItemRef;
};

type BulkResponse = {
  ok: boolean;
  success?: number;
  fail?: number;
  error?: string;
};

// =============================================================
// POST /api/cm/rpa/kaipoke/service-usage
// =============================================================

export const POST = cmRpaApiHandler<BulkResponse>(
  "cm/api/rpa/kaipoke/service-usage",
  async (request, logger) => {
    // リクエストボディ取得
    let body: BulkRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const { records, _job: jobParam } = body;

    // バリデーション
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

    // plan_achievement_details_id が必須
    const invalidRecords = records.filter(
      (r) => !r.plan_achievement_details_id
    );
    if (invalidRecords.length > 0) {
      if (jobParam) {
        await cmMarkJobItemFailed(
          jobParam,
          `${invalidRecords.length} records missing plan_achievement_details_id`
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error: `${invalidRecords.length} records missing plan_achievement_details_id`,
        },
        { status: 400 }
      );
    }

    // 監査コンテキスト設定
    const traceId = randomUUID();
    await supabaseAdmin.rpc("set_audit_context", {
      p_user_id: CM_RPA_SYSTEM_USER_ID,
      p_action: CM_OP_LOG_RPA_SERVICE_USAGE,
      p_trace_id: traceId,
    });

    // updated_at を追加
    const now = new Date().toISOString();
    const recordsWithTimestamp = records.map((r) => ({
      ...r,
      updated_at: now,
    }));

    // バルク upsert
    const { error: upsertError } = await supabaseAdmin
      .from("cm_kaipoke_service_usage")
      .upsert(recordsWithTimestamp, {
        onConflict: "plan_achievement_details_id",
      });

    if (upsertError) {
      logger.error("DB upsert エラー", undefined, {
        message: upsertError.message,
      });
      if (jobParam) {
        await cmMarkJobItemFailed(
          jobParam,
          `DB保存エラー: ${upsertError.message}`
        );
      }
      return NextResponse.json(
        { ok: false, error: "保存に失敗しました" },
        { status: 500 }
      );
    }

    // 成功時：_job があればアイテムを完了にする
    if (jobParam) {
      await cmMarkJobItemCompleted(jobParam);
    }

    // 操作ログ記録
    await recordOperationLog({
      userId: CM_RPA_SYSTEM_USER_ID,
      userName: CM_RPA_SYSTEM_USER_NAME,
      action: CM_OP_LOG_RPA_SERVICE_USAGE,
      resourceType: "service-usage",
      metadata: { recordCount: records.length },
      traceId,
    });

    return NextResponse.json({
      ok: true,
      success: records.length,
      fail: 0,
    });
  }
);