// =============================================================
// src/app/api/cron/cm/scheduled-jobs/route.ts
// 定期スケジュール一括実行API（Vercel Cron用）
// =============================================================

import 'server-only';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/common/logger';
import { executeAllSchedules } from '@/lib/cm/scheduled-jobs/executor';
import { getServerCronSecret, getIncomingCronToken } from '@/lib/cron/auth';

const logger = createLogger('api/cm/rpa/schedules/run-all');

/**
 * 共通ハンドラー
 */
async function handler(req: NextRequest) {
  // ---- 認証 ----
  const serverSecret = getServerCronSecret();
  const incoming = getIncomingCronToken(req);

  if (!serverSecret) {
    logger.warn('CRON_SECRET が未設定です');
    return NextResponse.json(
      { ok: false, error: 'server_secret_not_configured' },
      { status: 500 }
    );
  }

  if (incoming.token !== serverSecret) {
    logger.warn('認証失敗', { source: incoming.src });
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  // ---- 本体処理 ----
  logger.info('定期スケジュール一括実行開始');

  try {
    const result = await executeAllSchedules('cron');

    if (result.ok === false) {
      logger.warn('定期スケジュール一括実行失敗', { error: result.error });
      return NextResponse.json(result, { status: 500 });
    }

    logger.info('定期スケジュール一括実行完了', {
      total: result.results.length,
      success: result.results.filter((r) => r.status === 'success').length,
      failed: result.results.filter((r) => r.status === 'failed').length,
    });

    return NextResponse.json(result);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('定期スケジュール一括実行エラー', error as Error);

    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/cm/scheduled-jobs
 * Vercel Cron からの呼び出し
 */
export async function GET(req: NextRequest) {
  return handler(req);
}

/**
 * POST /api/cron/cm/scheduled-jobs
 * 外部スケジューラからの呼び出し
 */
export async function POST(req: NextRequest) {
  return handler(req);
}