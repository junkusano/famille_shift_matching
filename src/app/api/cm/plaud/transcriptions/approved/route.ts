// =============================================================
// src/app/api/cm/plaud/transcriptions/approved/route.ts
// 承認済み一覧取得API
// =============================================================
// GET /api/cm/plaud/transcriptions/approved
//
// status='approved' のレコード一覧を返す。
// Chrome拡張機能が文字起こし取得対象を把握するために使用。
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { requirePlaudAuth, isAuthError } from '@/lib/cm/plaud/auth';

const logger = createLogger('cm/plaud/transcriptions/approved');

// =============================================================
// 型定義
// =============================================================

type ApprovedRecord = {
  id: number;
  plaud_uuid: string;
  retry_count: number;
};

type ApprovedSuccessResponse = {
  ok: true;
  records: ApprovedRecord[];
  count: number;
};

type ApprovedErrorResponse = {
  ok: false;
  error: string;
};

type ApprovedResponse = ApprovedSuccessResponse | ApprovedErrorResponse;

// =============================================================
// GET: 承認済み一覧取得
// =============================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<ApprovedResponse>> {
  try {
    // ---------------------------------------------------------
    // 1. 認証チェック
    // ---------------------------------------------------------
    const auth = await requirePlaudAuth(request);
    if (isAuthError(auth)) return auth;

    // ---------------------------------------------------------
    // 2. 承認済みレコード取得
    // ---------------------------------------------------------
    const { data, error } = await supabaseAdmin
      .from('cm_plaud_transcriptions')
      .select('id, plaud_uuid, retry_count')
      .eq('status', 'approved')
      .order('plaud_created_at', { ascending: true });

    if (error) {
      logger.error('レコード取得エラー', { error: error.message });
      return NextResponse.json(
        { ok: false, error: 'Internal Server Error' },
        { status: 500 }
      );
    }

    const records: ApprovedRecord[] = data ?? [];

    logger.info('承認済み一覧取得成功', { count: records.length });

    return NextResponse.json({
      ok: true,
      records,
      count: records.length,
    });

  } catch (error) {
    logger.error('予期せぬエラー', error as Error);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
