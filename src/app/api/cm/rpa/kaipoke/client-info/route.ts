// =============================================================
// src/app/api/cm/rpa/kaipoke/client-info/route.ts
// RPA 利用者情報 API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/common/logger';
import { supabaseAdmin } from '@/lib/supabase/service';
import { validateApiKey } from '@/lib/cm/rpa/auth';

// =============================================================
// Logger
// =============================================================

const logger = createLogger('cm/api/rpa/kaipoke/client-info');

// =============================================================
// 型定義
// =============================================================

/**
 * 居宅介護支援事業所
 */
type SupportOffice = {
  apply_start?: string | null;
  office_name?: string | null;
  contract_type?: string | null;
  care_manager_kaipoke_id?: string | null;
  care_manager_name?: string | null;
  support_center_name?: string | null;
  notification_date?: string | null;
};

/**
 * 給付制限
 */
type BenefitLimit = {
  limit_start?: string | null;
  benefit_rate?: number | null;
};

/**
 * 被保険者証情報
 */
type InsuranceRecord = {
  kaipoke_insurance_id: string;
  coverage_start?: string | null;
  coverage_end?: string | null;
  insurer_code?: string | null;
  insurer_name?: string | null;
  cert_status?: string | null;
  insured_number?: string | null;
  issue_date?: string | null;
  certification_date?: string | null;
  cert_valid_start?: string | null;
  cert_valid_end?: string | null;
  care_level?: string | null;
  support_offices?: SupportOffice[];
  benefit_limits?: BenefitLimit[];
};

/**
 * 基本情報
 */
type BasicInfo = {
  name?: string | null;
  kana?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  postal_code?: string | null;
  prefecture?: string | null;
  city?: string | null;
  town?: string | null;
  building?: string | null;
  phone_01?: string | null;
  phone_02?: string | null;
  client_status?: string | null;
  contract_date?: string | null;
  biko?: string | null;
};

/**
 * リクエストボディ
 */
type RequestBody = {
  record: {
    kaipoke_cs_id: string;
    basic_info?: BasicInfo;
    insurance_list?: InsuranceRecord[];
  };
  _job?: {
    job_id: number;
    target_id: string;
  };
};

/**
 * APIレスポンス
 */
type ApiResponse = {
  ok: boolean;
  error?: string;
};

// =============================================================
// ヘルパー関数
// =============================================================

/**
 * ジョブアイテムを更新
 */
async function updateJobItem(
  jobId: number,
  targetId: string,
  status: 'completed' | 'failed',
  errorMessage?: string
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    processed_at: new Date().toISOString(),
  };
  if (errorMessage) {
    updates.error_message = errorMessage;
  }

  const { error } = await supabaseAdmin
    .from('cm_job_items')
    .update(updates)
    .eq('job_id', jobId)
    .eq('target_id', targetId);

  if (error) {
    logger.warn('ジョブアイテム更新失敗', { jobId, targetId, error: error.message });
  }
}

/**
 * 汎用upsert関数（既存パターンに準拠）
 * SELECT → UPDATE/INSERT 方式
 */
async function upsertRecord(
  tableName: string,
  data: Record<string, unknown>,
  matchConditions: Record<string, unknown>,
  logPrefix: string = ''
): Promise<boolean> {
  try {
    // 既存レコード検索
    let query = supabaseAdmin.from(tableName).select('id');
    for (const [column, value] of Object.entries(matchConditions)) {
      query = query.eq(column, value);
    }
    const { data: existing, error: selectError } = await query.single();

    // PGRST116 = 結果なし（正常）
    if (selectError && selectError.code !== 'PGRST116') {
      logger.error(`${logPrefix}検索エラー`, { tableName, error: selectError.message });
      return false;
    }

    // updated_at を追加
    data.updated_at = new Date().toISOString();

    if (existing) {
      // 更新
      const { error: updateError } = await supabaseAdmin
        .from(tableName)
        .update(data)
        .eq('id', (existing as { id: number }).id);

      if (updateError) {
        logger.error(`${logPrefix}更新エラー`, { tableName, error: updateError.message });
        return false;
      }
      logger.info(`${logPrefix}更新完了`, { tableName });
    } else {
      // 新規登録
      const { error: insertError } = await supabaseAdmin
        .from(tableName)
        .insert(data);

      if (insertError) {
        logger.error(`${logPrefix}登録エラー`, { tableName, error: insertError.message });
        return false;
      }
      logger.info(`${logPrefix}新規登録完了`, { tableName });
    }

    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${logPrefix}エラー`, { tableName, error: msg });
    return false;
  }
}

// =============================================================
// POST /api/cm/rpa/kaipoke/client-info
// =============================================================

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  let jobInfo: { job_id: number; target_id: string } | undefined;

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

    // 3. バリデーション
    if (!body.record) {
      return NextResponse.json({ ok: false, error: 'record is required' }, { status: 400 });
    }

    const { kaipoke_cs_id, basic_info, insurance_list } = body.record;
    jobInfo = body._job;

    if (!kaipoke_cs_id || typeof kaipoke_cs_id !== 'string') {
      const errorMsg = 'kaipoke_cs_id is required';
      if (jobInfo) {
        await updateJobItem(jobInfo.job_id, jobInfo.target_id, 'failed', errorMsg);
      }
      return NextResponse.json({ ok: false, error: errorMsg }, { status: 400 });
    }

    logger.info('利用者情報登録開始', {
      kaipoke_cs_id,
      hasBasicInfo: !!basic_info,
      insuranceCount: insurance_list?.length ?? 0,
      jobId: jobInfo?.job_id,
    });

    // 4. 基本情報のUPSERT（cm_kaipoke_info）
    if (basic_info) {
      const infoData: Record<string, unknown> = {
        kaipoke_cs_id,
        is_active: true,
      };

      // nullでない項目のみ含める
      if (basic_info.name) infoData.name = basic_info.name;
      if (basic_info.kana) infoData.kana = basic_info.kana;
      if (basic_info.gender) infoData.gender = basic_info.gender;
      if (basic_info.birth_date) infoData.birth_date = basic_info.birth_date;
      if (basic_info.postal_code) infoData.postal_code = basic_info.postal_code;
      if (basic_info.prefecture) infoData.prefecture = basic_info.prefecture;
      if (basic_info.city) infoData.city = basic_info.city;
      if (basic_info.town) infoData.town = basic_info.town;
      if (basic_info.building) infoData.building = basic_info.building;
      if (basic_info.phone_01) infoData.phone_01 = basic_info.phone_01;
      if (basic_info.phone_02) infoData.phone_02 = basic_info.phone_02;
      if (basic_info.client_status) infoData.client_status = basic_info.client_status;
      if (basic_info.contract_date) infoData.contract_date = basic_info.contract_date;
      if (basic_info.biko) infoData.biko = basic_info.biko;

      const success = await upsertRecord(
        'cm_kaipoke_info',
        infoData,
        { kaipoke_cs_id },
        '基本情報: '
      );

      if (!success) {
        const errorMsg = '基本情報の登録に失敗';
        if (jobInfo) {
          await updateJobItem(jobInfo.job_id, jobInfo.target_id, 'failed', errorMsg);
        }
        return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
      }
    }

    // 5. 被保険者証情報のUPSERT（cm_kaipoke_insurance）
    if (insurance_list && insurance_list.length > 0) {
      for (const insurance of insurance_list) {
        if (!insurance.kaipoke_insurance_id) {
          logger.warn('kaipoke_insurance_id欠損、スキップ', { kaipoke_cs_id });
          continue;
        }

        // 被保険者証本体
        const insuranceData: Record<string, unknown> = {
          kaipoke_cs_id,
          kaipoke_insurance_id: insurance.kaipoke_insurance_id,
        };

        // nullでない項目のみ含める
        if (insurance.coverage_start) insuranceData.coverage_start = insurance.coverage_start;
        if (insurance.coverage_end) insuranceData.coverage_end = insurance.coverage_end;
        if (insurance.insurer_code) insuranceData.insurer_code = insurance.insurer_code;
        if (insurance.insurer_name) insuranceData.insurer_name = insurance.insurer_name;
        if (insurance.cert_status) insuranceData.cert_status = insurance.cert_status;
        if (insurance.insured_number) insuranceData.insured_number = insurance.insured_number;
        if (insurance.issue_date) insuranceData.issue_date = insurance.issue_date;
        if (insurance.certification_date) insuranceData.certification_date = insurance.certification_date;
        if (insurance.cert_valid_start) insuranceData.cert_valid_start = insurance.cert_valid_start;
        if (insurance.cert_valid_end) insuranceData.cert_valid_end = insurance.cert_valid_end;
        if (insurance.care_level) insuranceData.care_level = insurance.care_level;

        await upsertRecord(
          'cm_kaipoke_insurance',
          insuranceData,
          { kaipoke_insurance_id: insurance.kaipoke_insurance_id },
          '被保険者証: '
        );

        // 居宅介護支援事業所（cm_kaipoke_support_office）
        if (insurance.support_offices && insurance.support_offices.length > 0) {
          for (const so of insurance.support_offices) {
            const supportData: Record<string, unknown> = {
              kaipoke_cs_id,
              kaipoke_insurance_id: insurance.kaipoke_insurance_id,
              apply_start: so.apply_start,
              office_name: so.office_name,
              contract_type: so.contract_type,
              care_manager_kaipoke_id: so.care_manager_kaipoke_id,
              care_manager_name: so.care_manager_name,
              support_center_name: so.support_center_name,
              notification_date: so.notification_date,
            };

            await upsertRecord(
              'cm_kaipoke_support_office',
              supportData,
              {
                kaipoke_cs_id,
                kaipoke_insurance_id: insurance.kaipoke_insurance_id,
                apply_start: so.apply_start,
              },
              '支援事業所: '
            );
          }
        }

        // 給付制限（cm_kaipoke_benefit_limit）
        if (insurance.benefit_limits && insurance.benefit_limits.length > 0) {
          for (const bl of insurance.benefit_limits) {
            const limitData: Record<string, unknown> = {
              kaipoke_cs_id,
              kaipoke_insurance_id: insurance.kaipoke_insurance_id,
              limit_start: bl.limit_start,
              benefit_rate: bl.benefit_rate,
            };

            await upsertRecord(
              'cm_kaipoke_benefit_limit',
              limitData,
              {
                kaipoke_cs_id,
                kaipoke_insurance_id: insurance.kaipoke_insurance_id,
                limit_start: bl.limit_start,
              },
              '給付制限: '
            );
          }
        }
      }
    }

    // 6. ジョブアイテム更新（成功）
    if (jobInfo) {
      await updateJobItem(jobInfo.job_id, jobInfo.target_id, 'completed');
    }

    logger.info('利用者情報登録完了', { kaipoke_cs_id });

    return NextResponse.json({ ok: true });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('利用者情報登録例外', { error: errorMessage });

    // ジョブアイテム更新（失敗）
    if (jobInfo) {
      await updateJobItem(jobInfo.job_id, jobInfo.target_id, 'failed', errorMessage);
    }

    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
