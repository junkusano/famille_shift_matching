// =============================================================
// src/lib/cm/contracts/getClientInfoForContract.ts
// 契約作成用 利用者情報取得（Server Action）
//
// 職員一覧は既存の getStaffList.ts を使用
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type { CmClientInfoForContract } from '@/types/cm/contractCreate';

const logger = createLogger('lib/cm/contracts/getClientInfoForContract');

// =============================================================
// Types
// =============================================================

export type GetClientInfoResult =
  | { ok: true; data: CmClientInfoForContract }
  | { ok: false; error: string };

// =============================================================
// 利用者情報取得
// =============================================================

/**
 * 契約作成用の利用者情報を取得
 */
export async function getClientInfoForContract(
  kaipokeCsId: string
): Promise<GetClientInfoResult> {
  try {
    logger.info('利用者情報取得開始', { kaipokeCsId });

    // ---------------------------------------------------------
    // 基本情報取得
    // ---------------------------------------------------------
    const { data: client, error: clientError } = await supabaseAdmin
      .from('cm_kaipoke_info')
      .select(`
        kaipoke_cs_id,
        name,
        kana,
        postal_code,
        prefecture,
        city,
        town,
        building,
        phone_01,
        phone_02,
        birth_date
      `)
      .eq('kaipoke_cs_id', kaipokeCsId)
      .single();

    if (clientError) {
      logger.error('利用者情報取得エラー', { message: clientError.message });
      return { ok: false, error: '利用者情報が見つかりません' };
    }

    // ---------------------------------------------------------
    // 最新の被保険者証から介護度を取得
    // ---------------------------------------------------------
    const { data: insurance } = await supabaseAdmin
      .from('cm_kaipoke_insurance')
      .select('care_level')
      .eq('kaipoke_cs_id', kaipokeCsId)
      .order('coverage_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ---------------------------------------------------------
    // 住所を結合
    // ---------------------------------------------------------
    const addressParts = [
      client.prefecture,
      client.city,
      client.town,
      client.building,
    ].filter(Boolean);
    const address = addressParts.join('');

    // ---------------------------------------------------------
    // 電話番号（phone_01優先）
    // ---------------------------------------------------------
    const phone = client.phone_01 || client.phone_02 || null;

    const result: CmClientInfoForContract = {
      kaipokeCsId: client.kaipoke_cs_id,
      name: client.name,
      nameKana: client.kana,
      postalCode: client.postal_code,
      address,
      phone,
      birthDate: client.birth_date,
      careLevel: insurance?.care_level ?? null,
    };

    logger.info('利用者情報取得完了', { kaipokeCsId });
    return { ok: true, data: result };
  } catch (e) {
    logger.error('予期せぬエラー', e as Error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}

/**
 * 職員名を取得（PDF生成用）
 */
export async function getStaffName(staffId: string): Promise<string | null> {
  try {
    // user_id から entry_id を取得
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('entry_id')
      .eq('user_id', staffId)
      .single();

    if (!user?.entry_id) {
      return null;
    }

    // form_entries から氏名を取得
    const { data: entry } = await supabaseAdmin
      .from('form_entries')
      .select('last_name_kanji, first_name_kanji')
      .eq('id', user.entry_id)
      .single();

    if (!entry) {
      return null;
    }

    return [entry.last_name_kanji, entry.first_name_kanji]
      .filter(Boolean)
      .join(' ') || null;
  } catch {
    return null;
  }
}