// =============================================================
// src/app/api/cron/cm/log-retention/route.ts
// ログリテンション Cron API
//
// 古いログレコードを定期的にクリーンアップする。
// Vercel Cron または外部スケジューラから呼び出す。
//
// 【実行タイミング】
// 毎日 23:00 JST（UTC 14:00）
// RPAが 0:30 JST から動くため、23:00〜0:00 の間に完了させる。
//
// 【呼び出し方法】
// GET  /api/cron/cm/log-retention
// POST /api/cron/cm/log-retention
//
// 【認証】
// Authorization: Bearer {CRON_SECRET}
// または ?token={CRON_SECRET}
// または x-cron-token: {CRON_SECRET}
//
// 【クエリパラメータ】
// - dryRun / dry_run: "true" | "1" | "yes" → カウントのみ（削除しない）
// - tables: カンマ区切りのテーブル名 → 指定テーブルのみ処理
//   例: ?tables=system_logs,cm_rpa_logs
//
// 【vercel.json 設定】
// {
//   "crons": [
//     {
//       "path": "/api/cron/cm/log-retention",
//       "schedule": "0 14 * * *"
//     }
//   ]
// }
// ※ UTC 14:00 = JST 23:00
// =============================================================

import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { cmLogRetentionCleanupCore } from "@/lib/cm/log-retention/core";
import { getServerCronSecret, getIncomingCronToken } from "@/lib/cron/auth";

const logger = createLogger("api/cron/cm/log-retention");

/**
 * dryRun パラメータをパース
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
      { ok: false, error: "server_secret_not_configured" },
      { status: 500 },
    );
  }

  if (incoming.token !== serverSecret) {
    logger.warn("認証失敗", { source: incoming.src });
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  // ---- クエリパラメータ ----
  const url = new URL(req.url);
  const dryRunParam =
    url.searchParams.get("dryRun") ?? url.searchParams.get("dry_run");
  const dryRun = parseBooleanParam(dryRunParam);
  const tablesParam = url.searchParams.get("tables");
  const targetTables = tablesParam
    ? tablesParam.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  // ---- 本体処理 ----
  logger.info("ログリテンション実行開始", { dryRun, targetTables: targetTables ?? "all" });

  try {
    const result = await cmLogRetentionCleanupCore({ dryRun, targetTables });

    if (result.ok) {
      logger.info("ログリテンション実行完了", {
        dryRun: result.dryRun,
        totalDeleted: result.totalDeleted,
        durationMs: result.durationMs,
      });
    } else {
      logger.warn("ログリテンション実行（一部エラー）", {
        dryRun: result.dryRun,
        totalDeleted: result.totalDeleted,
        errors: result.errors,
      });
    }

    const status = result.ok ? 200 : 207;
    return NextResponse.json(result, { status });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error("ログリテンション実行エラー", error as Error);

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 },
    );
  }
}

/**
 * GET /api/cron/cm/log-retention
 * Vercel Cron からの呼び出し
 */
export async function GET(req: NextRequest) {
  return handler(req);
}

/**
 * POST /api/cron/cm/log-retention
 * 外部スケジューラからの呼び出し
 */
export async function POST(req: NextRequest) {
  return handler(req);
}
