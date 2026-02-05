// =============================================================
// src/lib/cm/master/getSelectOptions.ts
// 選択肢マスタ取得
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type { CmSelectOption, CmSelectOptionCategory } from '@/types/cm/selectOptions';

const logger = createLogger('lib/cm/master/getSelectOptions');

// =============================================================
// Types
// =============================================================

export type GetSelectOptionsResult =
  | { ok: true; data: CmSelectOption[] }
  | { ok: false; error: string };

// =============================================================
// 選択肢マスタ取得
// =============================================================

/**
 * カテゴリ別に選択肢を取得
 */
export async function getSelectOptions(
  category: CmSelectOptionCategory
): Promise<GetSelectOptionsResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cm_select_options')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      logger.error('選択肢取得エラー', { category, error: error.message });
      return { ok: false, error: '選択肢の取得に失敗しました' };
    }

    return { ok: true, data: data ?? [] };
  } catch (e) {
    logger.error('選択肢取得例外', e as Error);
    return { ok: false, error: '選択肢の取得に失敗しました' };
  }
}

/**
 * 複数カテゴリの選択肢を一括取得
 */
export async function getSelectOptionsMultiple(
  categories: CmSelectOptionCategory[]
): Promise<{ ok: true; data: Record<CmSelectOptionCategory, CmSelectOption[]> } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cm_select_options')
      .select('*')
      .in('category', categories)
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      logger.error('選択肢一括取得エラー', { categories, error: error.message });
      return { ok: false, error: '選択肢の取得に失敗しました' };
    }

    // カテゴリ別にグループ化
    const grouped = {} as Record<CmSelectOptionCategory, CmSelectOption[]>;
    for (const cat of categories) {
      grouped[cat] = [];
    }
    for (const item of data ?? []) {
      const cat = item.category as CmSelectOptionCategory;
      if (grouped[cat]) {
        grouped[cat].push(item);
      }
    }

    return { ok: true, data: grouped };
  } catch (e) {
    logger.error('選択肢一括取得例外', e as Error);
    return { ok: false, error: '選択肢の取得に失敗しました' };
  }
}
