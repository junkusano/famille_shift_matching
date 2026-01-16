// =============================================================
// src/app/api/cm/rpa/kaipoke/service-usage/route.ts
// RPA サービス利用情報 API（バルク）
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
  _job?: JobParam;
};

type BulkResponse = {
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
    console.error('[service-usage] ジョブアイテム更新エラー:', e);
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
    console.error('[service-usage] ジョブアイテム更新エラー:', e);
  }
}

// -------------------------------------------------------------
// POST ハンドラ
// -------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse<BulkResponse>> {
  // _job パラメータを保持（エラー時のジョブアイテム更新用）
  let jobParam: JobParam | undefined;

  try {
    // 1. 認証
    if (!(await validateApiKey(request))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. リクエストボディ取得
    let body: BulkRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    // _job パラメータを抽出
    const { records, _job } = body;
    jobParam = _job;

    // 3. バリデーション
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

    // plan_achievement_details_id が必須
    const invalidRecords = records.filter((r) => !r.plan_achievement_details_id);
    if (invalidRecords.length > 0) {
      // バリデーションエラーは失敗扱い
      if (jobParam) {
        await markJobItemFailed(jobParam, `${invalidRecords.length} records missing plan_achievement_details_id`);
      }
      return NextResponse.json(
        { ok: false, error: `${invalidRecords.length} records missing plan_achievement_details_id` },
        { status: 400 }
      );
    }

    // 4. updated_at を追加
    const now = new Date().toISOString();
    const recordsWithTimestamp = records.map((r) => ({
      ...r,
      updated_at: now,
    }));

    // 5. バルク upsert
    const { error: upsertError } = await supabaseAdmin
      .from('cm_kaipoke_service_usage')
      .upsert(recordsWithTimestamp, { onConflict: 'plan_achievement_details_id' });

    if (upsertError) {
      console.error('[RPA service-usage] DB upsert error:', upsertError);
      // DB エラー時は失敗扱い
      if (jobParam) {
        await markJobItemFailed(jobParam, `DB保存エラー: ${upsertError.message}`);
      }
      return NextResponse.json({ ok: false, error: '保存に失敗しました' }, { status: 500 });
    }

    // 6. 成功時：_job があればアイテムを完了にする
    if (jobParam) {
      await markJobItemCompleted(jobParam);
    }

    return NextResponse.json({
      ok: true,
      success: records.length,
      fail: 0,
    });

  } catch (error) {
    console.error('[RPA service-usage] Unexpected error:', error);
    // 予期せぬエラー時も _job があれば失敗にする
    if (jobParam) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await markJobItemFailed(jobParam, errorMsg);
    }
    return NextResponse.json({ ok: false, error: '予期せぬエラーが発生しました' }, { status: 500 });
  }
}