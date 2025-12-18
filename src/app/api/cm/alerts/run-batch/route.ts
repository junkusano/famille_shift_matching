// src/app/api/cm/alerts/run-batch/route.ts
// CMアラートバッチ 手動実行API

import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createLogger, generateTraceId } from "@/lib/common/logger";
// index.ts経由ではなく直接インポート
import { cmAlertBatchOrchestrator } from "@/lib/cm/alert-batch/orchestrator";

const logger = createLogger("cm/api/alerts/run-batch");

// 手動実行を許可するロール
const ALLOWED_ROLES = ["admin", "manager", "senior_care_manager"];

type RunBatchRequestBody = {
  userId: string;
  role: string;
};

/**
 * POST /api/cm/alerts/run-batch
 * アラートバッチを手動実行
 * 
 * リクエストボディ:
 * - userId: ユーザーID
 * - role: system_role
 */
export async function POST(req: NextRequest) {
  const traceId = generateTraceId();
  const log = logger.withTrace(traceId);

  try {
    // 1. リクエストボディを取得
    let body: RunBatchRequestBody;
    try {
      body = await req.json();
    } catch {
      log.warn("リクエストボディのパースエラー");
      return NextResponse.json(
        { ok: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { userId, role } = body;

    // 2. 必須パラメータチェック
    if (!userId || !role) {
      log.warn("認証情報不足", { userId, role });
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 3. 権限チェック
    if (!ALLOWED_ROLES.includes(role)) {
      log.warn("権限エラー", { userId, role });
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    log.info("手動バッチ実行開始", { userId, role });

    // 4. バッチ実行
    const result = await cmAlertBatchOrchestrator({
      runType: "manual",
      triggeredBy: userId,
    });

    if (result.ok) {
      log.info("手動バッチ実行完了", { 
        batchRunId: result.batchRunId,
        stats: result.stats,
      });
    } else {
      log.warn("手動バッチ実行失敗", { 
        batchRunId: result.batchRunId,
        error: result.error,
      });
    }

    return NextResponse.json({
      ok: result.ok,
      batchRunId: result.batchRunId,
      stats: result.stats,
      error: result.error,
    });

  } catch (error) {
    log.error("手動バッチ実行エラー", error as Error);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}