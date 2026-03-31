// =============================================================
// src/lib/cm/log-retention/core.ts
// ログリテンション コアロジック
//
// 認証なし・"use server" なし。
// Cron API Route から直接呼ばれる。
// =============================================================

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { cmWithRetry, cmSanitizeErrorMessage } from "@/lib/cm/supabase/cmSupabaseRetry";
import {
  CM_LOG_RETENTION_POLICIES,
  CM_LOG_RETENTION_BATCH_SIZE,
  CM_LOG_RETENTION_BATCH_DELAY_MS,
} from "@/constants/cm/logRetentionPolicy";
import type {
  CmLogRetentionPolicy,
  CmLogRetentionTableResult,
  CmLogRetentionResult,
  CmLogRetentionOptions,
} from "@/types/cm/logRetention";

const logger = createLogger("lib/cm/log-retention/core");

// =============================================================
// ユーティリティ
// =============================================================

/**
 * 指定日数前の ISO 8601 タイムスタンプを返す
 */
function cmLogRetentionCutoffDate(retentionDays: number): string {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff.toISOString();
}

/**
 * バッチ間の待機
 */
function cmLogRetentionDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ポリシーの追加フィルターをクエリに適用する
 *
 * Supabase クエリビルダーは不変ではないため、
 * 呼び出し側で構築中のクエリを渡して戻り値で受け取る。
 */
function cmLogRetentionApplyFilter<
  T extends {
    eq: (column: string, value: string | number) => T;
    neq: (column: string, value: string | number) => T;
    in: (column: string, value: string[]) => T;
    gte: (column: string, value: string | number) => T;
    lte: (column: string, value: string | number) => T;
  },
>(query: T, policy: CmLogRetentionPolicy): T {
  if (!policy.additionalFilter) return query;

  const { column, operator, value } = policy.additionalFilter;
  switch (operator) {
    case "eq":
      return query.eq(column, value as string | number) as T;
    case "neq":
      return query.neq(column, value as string | number) as T;
    case "gte":
      return query.gte(column, value as string | number) as T;
    case "lte":
      return query.lte(column, value as string | number) as T;
    case "in":
      if (Array.isArray(value)) {
        return query.in(column, value) as T;
      }
      return query;
    default:
      return query;
  }
}

// =============================================================
// 単一テーブルのクリーンアップ（ドライラン対応）
// =============================================================

/**
 * ドライラン: 削除対象件数をカウントする
 *
 * cmWithRetry は count プロパティを返さないため、
 * 直接クエリして cmSanitizeErrorMessage でエラー処理する。
 */
async function cmLogRetentionCountTarget(
  policy: CmLogRetentionPolicy,
  cutoffDate: string,
): Promise<{ count: number; error?: string }> {
  let query = supabaseAdmin
    .schema(policy.schema)
    .from(policy.table)
    .select("*", { count: "exact", head: true })
    .lt(policy.timestampColumn, cutoffDate);

  query = cmLogRetentionApplyFilter(query, policy);

  const { count, error } = await query;

  if (error) {
    const sanitized = cmSanitizeErrorMessage(error);
    return { count: 0, error: sanitized };
  }

  return { count: count ?? 0 };
}

/**
 * 実削除: バッチ削除を繰り返す
 *
 * Supabase REST API は DELETE に LIMIT を直接指定できないため、
 * SELECT で対象IDを取得 → DELETE ... IN (ids) のパターンで処理する。
 */
async function cmLogRetentionDeleteBatch(
  policy: CmLogRetentionPolicy,
  cutoffDate: string,
): Promise<{ deletedCount: number; error?: string }> {
  let totalDeleted = 0;
  const idColumn = "id";

  for (;;) {
    // 1. 削除対象のIDをバッチサイズ分取得
    let selectQuery = supabaseAdmin
      .schema(policy.schema)
      .from(policy.table)
      .select(idColumn)
      .lt(policy.timestampColumn, cutoffDate)
      .limit(CM_LOG_RETENTION_BATCH_SIZE);

    selectQuery = cmLogRetentionApplyFilter(selectQuery, policy);

    const { data: rows, error: selectError } = await cmWithRetry(
      () => selectQuery,
      { operationLabel: `${policy.label}: SELECT ids`, logger },
    );

    if (selectError) {
      return { deletedCount: totalDeleted, error: selectError.message };
    }

    if (!rows || rows.length === 0) {
      break;
    }

    // 2. 取得したIDで一括削除
    const ids = rows.map((r: Record<string, unknown>) => r[idColumn]);

    const { error: deleteError } = await cmWithRetry(
      () =>
        supabaseAdmin
          .schema(policy.schema)
          .from(policy.table)
          .delete()
          .in(idColumn, ids),
      { operationLabel: `${policy.label}: DELETE batch`, logger },
    );

    if (deleteError) {
      return { deletedCount: totalDeleted, error: deleteError.message };
    }

    totalDeleted += ids.length;

    logger.info("バッチ削除", {
      table: `${policy.schema}.${policy.table}`,
      batchSize: ids.length,
      totalDeleted,
    });

    // バッチサイズ未満 = 残りなし
    if (ids.length < CM_LOG_RETENTION_BATCH_SIZE) {
      break;
    }

    // DB負荷軽減のため待機
    await cmLogRetentionDelay(CM_LOG_RETENTION_BATCH_DELAY_MS);
  }

  return { deletedCount: totalDeleted };
}

// =============================================================
// 単一テーブルの処理
// =============================================================

async function cmLogRetentionProcessTable(
  policy: CmLogRetentionPolicy,
  dryRun: boolean,
): Promise<CmLogRetentionTableResult> {
  const startTime = Date.now();
  const cutoffDate = cmLogRetentionCutoffDate(policy.retentionDays);

  const result: CmLogRetentionTableResult = {
    schema: policy.schema,
    table: policy.table,
    label: policy.label,
    retentionDays: policy.retentionDays,
    cutoffDate,
    deletedCount: 0,
    durationMs: 0,
  };

  try {
    if (dryRun) {
      const { count, error } = await cmLogRetentionCountTarget(policy, cutoffDate);
      result.deletedCount = count;
      if (error) {
        result.error = error;
      }
    } else {
      const { deletedCount, error } = await cmLogRetentionDeleteBatch(policy, cutoffDate);
      result.deletedCount = deletedCount;
      if (error) {
        result.error = error;
      }
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("テーブル処理例外", e instanceof Error ? e : undefined, {
      table: `${policy.schema}.${policy.table}`,
    });
    result.error = errorMessage;
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// =============================================================
// メインエントリポイント
// =============================================================

/**
 * ログリテンション クリーンアップを実行する
 *
 * - dryRun: true → 削除対象の件数をカウントして返す（削除しない）
 * - dryRun: false → 実際に古いレコードをバッチ削除する
 * - targetTables: 指定がある場合、そのテーブルのみ処理する
 */
export async function cmLogRetentionCleanupCore(
  options: CmLogRetentionOptions,
): Promise<CmLogRetentionResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  logger.info("ログリテンション開始", {
    dryRun: options.dryRun,
    targetTables: options.targetTables ?? "all",
  });

  // ポリシーをフィルタリング
  let policies = CM_LOG_RETENTION_POLICIES;
  if (options.targetTables && options.targetTables.length > 0) {
    policies = policies.filter((p) =>
      options.targetTables!.includes(p.table),
    );
  }

  // 各テーブルを順次処理
  const tableResults: CmLogRetentionTableResult[] = [];
  const errors: string[] = [];

  for (const policy of policies) {
    logger.info("テーブル処理開始", {
      table: `${policy.schema}.${policy.table}`,
      retentionDays: policy.retentionDays,
      dryRun: options.dryRun,
    });

    const result = await cmLogRetentionProcessTable(policy, options.dryRun);
    tableResults.push(result);

    if (result.error) {
      errors.push(`${policy.schema}.${policy.table}: ${result.error}`);
    }

    logger.info("テーブル処理完了", {
      table: `${policy.schema}.${policy.table}`,
      deletedCount: result.deletedCount,
      durationMs: result.durationMs,
      error: result.error ?? null,
    });
  }

  const totalDeleted = tableResults.reduce((sum, r) => sum + r.deletedCount, 0);
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  logger.info("ログリテンション完了", {
    dryRun: options.dryRun,
    totalDeleted,
    tableCount: tableResults.length,
    errorCount: errors.length,
    durationMs,
  });

  return {
    ok: errors.length === 0,
    dryRun: options.dryRun,
    startedAt,
    completedAt,
    durationMs,
    tables: tableResults,
    totalDeleted,
    errors,
  };
}