// =============================================================
// src/lib/cm/master/getOwnOffice.ts
// 自社事業所マスタ取得
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type { CmOwnOffice } from '@/types/cm/selectOptions';

const logger = createLogger('lib/cm/master/getOwnOffice');

// =============================================================
// Types
// =============================================================

export type GetOwnOfficeResult =
  | { ok: true; data: CmOwnOffice }
  | { ok: false; error: string };

export type GetOwnOfficeListResult =
  | { ok: true; data: CmOwnOffice[] }
  | { ok: false; error: string };

// =============================================================
// 自社事業所取得
// =============================================================

/**
 * デフォルト事業所を取得
 */
export async function getDefaultOwnOffice(): Promise<GetOwnOfficeResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cm_own_office')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (error) {
      logger.error('デフォルト事業所取得エラー', { error: error.message });
      return { ok: false, error: '事業所情報の取得に失敗しました' };
    }

    if (!data) {
      return { ok: false, error: 'デフォルト事業所が設定されていません' };
    }

    return { ok: true, data };
  } catch (e) {
    logger.error('デフォルト事業所取得例外', e as Error);
    return { ok: false, error: '事業所情報の取得に失敗しました' };
  }
}

/**
 * 事業所コードで取得
 */
export async function getOwnOfficeByCode(code: string): Promise<GetOwnOfficeResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cm_own_office')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (error) {
      logger.error('事業所取得エラー', { code, error: error.message });
      return { ok: false, error: '事業所情報の取得に失敗しました' };
    }

    if (!data) {
      return { ok: false, error: '事業所が見つかりません' };
    }

    return { ok: true, data };
  } catch (e) {
    logger.error('事業所取得例外', e as Error);
    return { ok: false, error: '事業所情報の取得に失敗しました' };
  }
}

/**
 * 全事業所一覧を取得
 */
export async function getOwnOfficeList(): Promise<GetOwnOfficeListResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cm_own_office')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');

    if (error) {
      logger.error('事業所一覧取得エラー', { error: error.message });
      return { ok: false, error: '事業所一覧の取得に失敗しました' };
    }

    return { ok: true, data: data ?? [] };
  } catch (e) {
    logger.error('事業所一覧取得例外', e as Error);
    return { ok: false, error: '事業所一覧の取得に失敗しました' };
  }
}
