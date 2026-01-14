// =============================================================
// src/app/api/cm/rpa/kaipoke/service-usage/route.ts
// RPA サービス利用情報 API（バルク）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

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
};

type BulkResponse = {
  ok: boolean;
  success?: number;
  fail?: number;
  error?: string;
};

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

export async function POST(request: NextRequest): Promise<NextResponse<BulkResponse>> {
  try {
    if (!(await validateApiKey(request))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: BulkRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body.records || !Array.isArray(body.records)) {
      return NextResponse.json({ ok: false, error: 'records array is required' }, { status: 400 });
    }

    if (body.records.length === 0) {
      return NextResponse.json({ ok: true, success: 0, fail: 0 });
    }

    // バリデーション: plan_achievement_details_id が必須
    const invalidRecords = body.records.filter((r) => !r.plan_achievement_details_id);
    if (invalidRecords.length > 0) {
      return NextResponse.json(
        { ok: false, error: `${invalidRecords.length} records missing plan_achievement_details_id` },
        { status: 400 }
      );
    }

    // updated_at を追加
    const now = new Date().toISOString();
    const recordsWithTimestamp = body.records.map((r) => ({
      ...r,
      updated_at: now,
    }));

    // バルク upsert
    const { error: upsertError } = await supabaseAdmin
      .from('cm_kaipoke_service_usage')
      .upsert(recordsWithTimestamp, { onConflict: 'plan_achievement_details_id' });

    if (upsertError) {
      console.error('[RPA service-usage] DB upsert error:', upsertError);
      return NextResponse.json({ ok: false, error: '保存に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      success: body.records.length,
      fail: 0,
    });
  } catch (error) {
    console.error('[RPA service-usage] Unexpected error:', error);
    return NextResponse.json({ ok: false, error: '予期せぬエラーが発生しました' }, { status: 500 });
  }
}