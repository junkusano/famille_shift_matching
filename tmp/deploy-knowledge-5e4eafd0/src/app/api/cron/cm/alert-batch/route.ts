// src/app/api/cron/cm/alert-batch/route.ts
// CMアラートバッチ スケジュール実行API（Vercel Cron / 外部スケジューラ用）

import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
// index.ts経由ではなく直接インポート
import { cmAlertBatchOrchestrator } from "@/lib/cm/alert-batch/orchestrator";
import { getServerCronSecret, getIncomingCronToken } from "@/lib/cron/auth";

const logger = createLogger("cm/cron/alert-batch");

/**
 * dryRunパラメータをパース
 */
function parseBooleanParam(v: string | null): boolean {
  return v === "1" || v === "true" || v === "yes";
}

/**
 * 共通ハンドラー
 */
async function handler(req: NextRequest) {
  // ---- 認証 ----
  const serverSecret = getServerCronSecret();
  const incoming = getIncomingCronToken(req);

  if (!serverSecret) {
    logger.warn("CRON_SECRET が未設定です");
    return NextResponse.json(
      { ok: false, reason: "server_secret_not_configured" },
      { status: 500 }
    );
  }

  if (incoming.token !== serverSecret) {
    logger.warn("認証失敗", { source: incoming.src });
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 }
    );
  }

  // ---- クエリパラメータ ----
  const url = new URL(req.url);
  const dryRunParam = url.searchParams.get("dryRun") ?? url.searchParams.get("dry_run");
  const dryRun = parseBooleanParam(dryRunParam);

  if (dryRun) {
    logger.info("ドライラン実行（処理はスキップ）");
    return NextResponse.json({
      ok: true,
      dryRun: true,
      message: "Dry run - no processing performed",
    });
  }

  // ---- 本体処理 ----
  logger.info("スケジュールバッチ実行開始");

  try {
    const result = await cmAlertBatchOrchestrator({
      runType: "scheduled",
    });

    if (result.ok === true) {
      logger.info("スケジュールバッチ実行完了", {
        batchRunId: result.batchRunId,
        stats: result.stats,
      });
    } else {
      logger.warn("スケジュールバッチ実行失敗", {
        batchRunId: result.batchRunId,
        error: result.error,
      });
    }

    const status = result.ok ? 200 : 500;
    return NextResponse.json(result, { status });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("スケジュールバッチ実行エラー", error as Error);

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/cm-alert-batch
 * Vercel Cron からの呼び出し
 */
export async function GET(req: NextRequest) {
  return handler(req);
}

/**
 * POST /api/cron/cm-alert-batch
 * 外部スケジューラからの呼び出し
 */
export async function POST(req: NextRequest) {
  return handler(req);
}