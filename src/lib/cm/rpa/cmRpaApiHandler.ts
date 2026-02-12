// =============================================================
// src/lib/cm/rpa/cmRpaApiHandler.ts
// RPA API Route 共通ラッパー
//
// 全 RPA API Route で重複している以下の処理を集約:
//   - APIキー認証（validateApiKey）
//   - ロガー初期化（createLogger）
//   - try-catch + 500レスポンス
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger, Logger } from "@/lib/common/logger";
import { validateApiKey } from "@/lib/cm/rpa/auth";

/**
 * RPA API のレスポンス基本型
 * 全レスポンスは ok フィールドを持つ
 */
type CmRpaApiResult = { ok: boolean; error?: string };

/**
 * ハンドラ関数の型（params なし）
 * 認証済みの request と logger を受け取り、NextResponse を返す
 */
type CmRpaHandler<T extends CmRpaApiResult> = (
  request: NextRequest,
  logger: Logger
) => Promise<NextResponse<T>>;

/**
 * Dynamic Route 用ハンドラ関数の型
 * context（params）も受け取る
 */
type CmRpaHandlerWithContext<T extends CmRpaApiResult, C> = (
  request: NextRequest,
  context: C,
  logger: Logger
) => Promise<NextResponse<T>>;

/**
 * RPA API Route の共通ラッパー（params なし）
 *
 * 以下を自動で処理する:
 *   1. APIキー認証 → 失敗時 401
 *   2. try-catch → 未捕捉例外時 500
 *   3. ロガー初期化
 *
 * @example
 * export const GET = cmRpaApiHandler<CmJobListResponse>(
 *   "cm/api/rpa/jobs",
 *   async (request, logger) => {
 *     // ここでは認証済み、try-catch 済み
 *     // 本質的なロジックだけ書く
 *     const result = await getJobs({ ... });
 *     return NextResponse.json(result);
 *   }
 * );
 */
export function cmRpaApiHandler<T extends CmRpaApiResult>(
  loggerName: string,
  handler: CmRpaHandler<T>
): (request: NextRequest) => Promise<NextResponse<T>> {
  const logger = createLogger(loggerName);

  return async (request: NextRequest) => {
    // 1. APIキー認証
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" } as T,
        { status: 401 }
      );
    }

    // 2. 本体処理（try-catch で囲む）
    try {
      return await handler(request, logger);
    } catch (error) {
      logger.error("処理例外", error as Error);
      return NextResponse.json(
        { ok: false, error: "予期せぬエラーが発生しました" } as T,
        { status: 500 }
      );
    }
  };
}

/**
 * RPA API Route の共通ラッパー（Dynamic Route 用、context あり）
 *
 * Next.js の Dynamic Route（[id] など）で使用する。
 * context から params を取得できる。
 *
 * @example
 * export const GET = cmRpaApiHandlerWithContext<CmJobDetailResponse, RouteContext>(
 *   "cm/api/rpa/jobs/[id]",
 *   async (request, context, logger) => {
 *     const { id } = await context.params;
 *     const result = await getJobDetail(parseInt(id, 10));
 *     return NextResponse.json(result);
 *   }
 * );
 */
export function cmRpaApiHandlerWithContext<
  T extends CmRpaApiResult,
  C
>(
  loggerName: string,
  handler: CmRpaHandlerWithContext<T, C>
): (request: NextRequest, context: C) => Promise<NextResponse<T>> {
  const logger = createLogger(loggerName);

  return async (request: NextRequest, context: C) => {
    // 1. APIキー認証
    const isValid = await validateApiKey(request);
    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" } as T,
        { status: 401 }
      );
    }

    // 2. 本体処理（try-catch で囲む）
    try {
      return await handler(request, context, logger);
    } catch (error) {
      logger.error("処理例外", error as Error);
      return NextResponse.json(
        { ok: false, error: "予期せぬエラーが発生しました" } as T,
        { status: 500 }
      );
    }
  };
}
