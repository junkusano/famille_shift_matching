// src/lib/cm/alert-batch/orchestrator.ts
// CMアラートバッチ オーケストレーター

import { createLogger, generateTraceId } from "@/lib/common/logger";
import type {
  CmBatchRunOptions,
  CmBatchRunResult,
  CmBatchStats,
} from "@/types/cm/alert-batch";
import {
  cmCreateBatchRun,
  cmCompleteBatchRun,
  cmFailBatchRun,
} from "./utils/alert-repository";
import { cmProcessInsuranceAlerts } from "./processors/insurance";
import { cmProcessNoManagerAlerts } from "./processors/no-manager";

const logger = createLogger("cm/cron/alert-batch");

/**
 * CMアラートバッチ オーケストレーター
 * 各カテゴリのアラート処理を順次実行し、結果を集約する
 */
export async function cmAlertBatchOrchestrator(
  options: CmBatchRunOptions
): Promise<CmBatchRunResult> {
  const traceId = generateTraceId();
  const log = logger.withTrace(traceId);

  // 1. バッチ実行レコード作成
  let batchRunId: string;
  try {
    const batchRun = await cmCreateBatchRun(options);
    batchRunId = batchRun.id;
    log.info("バッチ開始", { batchRunId, runType: options.runType });
  } catch (error) {
    log.error("バッチ実行レコード作成失敗", error as Error);
    return {
      ok: false,
      batchRunId: "",
      error: `バッチ実行レコード作成失敗: ${String(error)}`,
    };
  }

  try {
    const stats: CmBatchStats = {};

    // 2a. 被保険者証アラート処理
    log.info("被保険者証アラート処理開始");
    stats.insurance = await cmProcessInsuranceAlerts(batchRunId, log);

    // 2b. 担当者未設定アラート処理
    log.info("担当者未設定アラート処理開始");
    stats.no_manager = await cmProcessNoManagerAlerts(batchRunId, log);

    // 3. バッチ完了
    await cmCompleteBatchRun(batchRunId, stats);
    log.info("バッチ完了", { stats });

    return { ok: true, batchRunId, stats };

  } catch (error) {
    // 4. エラー処理
    const errorMessage = error instanceof Error ? error.message : String(error);
    await cmFailBatchRun(batchRunId, errorMessage);
    log.error("バッチ失敗", error as Error);

    return {
      ok: false,
      batchRunId,
      error: errorMessage,
    };
  }
}