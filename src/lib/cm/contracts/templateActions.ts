// =============================================================
// src/lib/cm/contracts/templateActions.ts
// テンプレート管理 Server Actions
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import type {
  CmContractTemplate,
  CmContractTemplateListItem,
  CmContractTemplateCode,
} from '@/types/cm/contractTemplate';

const logger = createLogger('lib/cm/contracts/templateActions');

// =============================================================
// Types
// =============================================================

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// =============================================================
// テンプレート一覧取得
// =============================================================

export async function getTemplateList(): Promise<ActionResult<CmContractTemplateListItem[]>> {
  try {
    logger.debug('テンプレート一覧取得開始');

    const { data, error } = await supabaseAdmin
      .from('cm_contract_templates')
      .select('id, code, name, is_active, updated_at, updated_by')
      .order('code', { ascending: true });

    if (error) {
      logger.error('テンプレート一覧取得エラー', { message: error.message });
      return { ok: false, error: error.message };
    }

    // updated_byから名前を取得
    const templates = data ?? [];
    const userIds = templates.map(t => t.updated_by).filter((id): id is string => id != null);
    
    const userNameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('user_id, entry_id')
        .in('user_id', userIds);
      
      if (users && users.length > 0) {
        const entryIds = users.map(u => u.entry_id).filter((id): id is string => id != null);
        if (entryIds.length > 0) {
          const { data: entries } = await supabaseAdmin
            .from('form_entries')
            .select('id, last_name_kanji, first_name_kanji')
            .in('id', entryIds);
          
          const entryNameMap = new Map<string, string>();
          (entries ?? []).forEach(e => {
            entryNameMap.set(e.id, [e.last_name_kanji, e.first_name_kanji].filter(Boolean).join(' '));
          });
          
          users.forEach(u => {
            if (u.entry_id && entryNameMap.has(u.entry_id)) {
              userNameMap.set(u.user_id, entryNameMap.get(u.entry_id)!);
            }
          });
        }
      }
    }

    const result: CmContractTemplateListItem[] = templates.map(t => ({
      ...t,
      updated_by_name: t.updated_by ? userNameMap.get(t.updated_by) ?? null : null,
    })) as CmContractTemplateListItem[];

    logger.debug('テンプレート一覧取得完了', { count: result.length });
    return { ok: true, data: result };
  } catch (e) {
    logger.error('予期せぬエラー', e as Error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}

// =============================================================
// テンプレート詳細取得（コードで）
// =============================================================

export async function getTemplateByCode(
  code: CmContractTemplateCode
): Promise<ActionResult<CmContractTemplate>> {
  try {
    logger.debug('テンプレート取得開始', { code });

    const { data, error } = await supabaseAdmin
      .from('cm_contract_templates')
      .select('*')
      .eq('code', code)
      .single();

    if (error) {
      logger.error('テンプレート取得エラー', { code, message: error.message });
      return { ok: false, error: 'テンプレートが見つかりません' };
    }

    logger.debug('テンプレート取得完了', { code });
    return { ok: true, data: data as CmContractTemplate };
  } catch (e) {
    logger.error('予期せぬエラー', e as Error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}

// =============================================================
// テンプレート更新
// =============================================================

export async function updateTemplate(
  code: CmContractTemplateCode,
  htmlContent: string,
  updatedBy: string
): Promise<ActionResult> {
  try {
    logger.info('テンプレート更新開始', { code, updatedBy });

    const { error } = await supabaseAdmin
      .from('cm_contract_templates')
      .update({ 
        html_content: htmlContent,
        updated_by: updatedBy,
      })
      .eq('code', code);

    if (error) {
      logger.error('テンプレート更新エラー', { code, message: error.message });
      return { ok: false, error: error.message };
    }

    logger.info('テンプレート更新完了', { code });
    return { ok: true };
  } catch (e) {
    logger.error('予期せぬエラー', e as Error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}

// =============================================================
// 有効なテンプレート一覧取得（契約作成用）
// =============================================================

export async function getActiveTemplates(): Promise<ActionResult<CmContractTemplateListItem[]>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cm_contract_templates')
      .select('id, code, name, is_required, sort_order, is_active, updated_at, updated_by')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, data: (data ?? []) as CmContractTemplateListItem[] };
  } catch (e) {
    logger.error('予期せぬエラー', e as Error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}

// =============================================================
// テンプレートHTML取得（PDF生成用）
// =============================================================

export async function getTemplateHtml(
  code: CmContractTemplateCode
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('cm_contract_templates')
      .select('html_content')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    return data?.html_content ?? null;
  } catch {
    return null;
  }
}