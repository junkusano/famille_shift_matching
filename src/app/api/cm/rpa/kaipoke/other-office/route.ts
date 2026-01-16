// =============================================================
// src/app/api/cm/rpa/kaipoke/other-office/route.ts
// RPA 他社事業所情報 API（バルク UPSERT）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

// -------------------------------------------------------------
// 型定義
// -------------------------------------------------------------

/**
 * _job パラメータ
 */
type JobParam = {
  job_id: number;
  target_id: string;
};

/**
 * 他社事業所情報レコード
 */
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

/**
 * リクエストボディ
 */
type RequestBody = {
  records: OtherOfficeRecord[];
  _job?: JobParam;
};

/**
 * APIレスポンス
 */
type ApiResponse = {
  ok: boolean;
  success?: number;
  fail?: number;
  error?: string;
};

// -------------------------------------------------------------
// 認証
// -------------------------------------------------------------

async function validateApiKey(request: NextRequest): Promise<boolean> {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) return false;

  const { data, error } = await supabaseAdmin
    .from('cm_rpa_api_keys')
    .select('id')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .limit(1)
    .single();

  return !error && !!data;
}

// -------------------------------------------------------------
// ジョブアイテム更新ヘルパー
// -------------------------------------------------------------

async function markJobItemCompleted(jobParam: JobParam): Promise<void> {
  try {
    await supabaseAdmin
      .from('cm_job_items')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('job_id', jobParam.job_id)
      .eq('target_id', jobParam.target_id);
  } catch (e) {
    console.error('[other-office] ジョブアイテム更新エラー:', e);
  }
}

async function markJobItemFailed(jobParam: JobParam, errorMessage: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('cm_job_items')
      .update({
        status: 'failed',
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('job_id', jobParam.job_id)
      .eq('target_id', jobParam.target_id);
  } catch (e) {
    console.error('[other-office] ジョブアイテム更新エラー:', e);
  }
}

// -------------------------------------------------------------
// バリデーション
// -------------------------------------------------------------

function validateRecord(record: OtherOfficeRecord): string | null {
  // 必須項目チェック
  if (!record.kaipoke_office_id) {
    return 'kaipoke_office_id is required';
  }

  // kaipoke_office_id 形式チェック（空文字禁止）
  if (typeof record.kaipoke_office_id !== 'string' || record.kaipoke_office_id.trim() === '') {
    return 'kaipoke_office_id must be a non-empty string';
  }

  // is_satellite 型チェック（指定時のみ）
  if (record.is_satellite !== undefined && typeof record.is_satellite !== 'boolean') {
    return 'is_satellite must be a boolean';
  }

  return null;
}

// -------------------------------------------------------------
// POST ハンドラ
// -------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  // _job パラメータを保持（エラー時のジョブアイテム更新用）
  let jobParam: JobParam | undefined;

  try {
    // 1. 認証
    if (!(await validateApiKey(request))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. リクエストボディ取得
    let body: RequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    // _job パラメータを抽出
    const { records, _job } = body;
    jobParam = _job;

    // 3. records 配列チェック
    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ ok: false, error: 'records array is required' }, { status: 400 });
    }

    if (records.length === 0) {
      // 空配列の場合も成功扱い（_job があれば完了にする）
      if (jobParam) {
        await markJobItemCompleted(jobParam);
      }
      return NextResponse.json({ ok: true, success: 0, fail: 0 });
    }

    // 4. バルク UPSERT 処理
    let successCount = 0;
    let failCount = 0;

    for (const record of records) {
      // バリデーション
      const validationError = validateRecord(record);
      if (validationError) {
        console.error('[RPA other-office] Validation error:', validationError, record);
        failCount++;
        continue;
      }

      // UPSERT 用データ作成
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

      // UPSERT 実行
      const { error: dbError } = await supabaseAdmin
        .from('cm_kaipoke_other_office')
        .upsert(upsertData, { onConflict: 'kaipoke_office_id' });

      if (dbError) {
        console.error('[RPA other-office] DB error:', dbError, upsertData);
        failCount++;
      } else {
        successCount++;
      }
    }

    // 5. _job パラメータの処理
    if (jobParam) {
      if (failCount === 0) {
        // 全件成功：アイテムを完了にする
        await markJobItemCompleted(jobParam);
      } else if (successCount === 0) {
        // 全件失敗：アイテムを失敗にする
        await markJobItemFailed(jobParam, `全 ${failCount} 件の保存に失敗しました`);
      } else {
        // 一部成功：成功扱いにする（部分的な成功も進捗として記録）
        await markJobItemCompleted(jobParam);
      }
    }

    // 6. 成功レスポンス
    return NextResponse.json({
      ok: true,
      success: successCount,
      fail: failCount,
    });

  } catch (error) {
    console.error('[RPA other-office] Unexpected error:', error);
    // 予期せぬエラー時も _job があれば失敗にする
    if (jobParam) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await markJobItemFailed(jobParam, errorMsg);
    }
    return NextResponse.json(
      { ok: false, error: '予期せぬエラーが発生しました' },
      { status: 500 }
    );
  }
}