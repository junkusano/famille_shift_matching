// =============================================================
// src/lib/cm/contracts/templateActions.ts
// テンプレート管理 Server Actions
//
// セキュリティ:
//   書き込み系（updateTemplate）は requireCmSession(token) を必須実施。
//   読み取り系（getTemplateList, getTemplateByCode, getActiveTemplates）は
//   Server Component (page.tsx) からも呼ばれるため token はオプション。
//   ※ 将来的には Server Component → lib関数直接呼び出しに移行し、
//     全 Server Actions で token 必須化を推奨。
//
// 内部専用関数（getTemplateHtml 等）は templateCore.ts に配置。
// "use server" ファイルに認証なしの supabaseAdmin 呼び出しを置かないこと。
// =============================================================

'use server';

import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { requireCmSession, CmAuthError } from '@/lib/cm/auth/requireCmSession';
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
// 共通: エラーハンドリング
// =============================================================

function handleActionError(
  error: unknown,
  fallbackMessage: string,
): { ok: false; error: string } {
  if (error instanceof CmAuthError) {
    return { ok: false, error: error.message };
  }
  logger.error(fallbackMessage, error as Error);
  return { ok: false, error: 'サーバーエラーが発生しました' };
}

// =============================================================
// テンプレート一覧取得
// ※ Server Component (page.tsx) からも呼ばれるため token はオプション
// TODO: Server Component は lib関数を直接呼ぶよう移行し、token 必須化する
// =============================================================

export async function getTemplateList(token?: string): Promise<ActionResult<CmContractTemplateListItem[]>> {
  try {
    if (token) {
      await requireCmSession(token);
    }

    logger.debug('テンプレート一覧取得開始');

    const { data, error } = await supabaseAdmin
      .from('cm_contract_templates')
      .select('id, code, name, is_active, updated_at, updated_by')
      .order('code', { ascending: true });

    if (error) {
      logger.error('テンプレート一覧取得エラー', { message: error.message });
      return { ok: false, error: 'テンプレート一覧の取得に失敗しました' };
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
  } catch (error) {
    return handleActionError(error, 'テンプレート一覧取得エラー');
  }
}

// =============================================================
// テンプレート詳細取得（コードで）
// ※ createContract.ts 内部からも呼ばれるため token はオプション
// TODO: 内部呼び出しは lib関数を直接呼ぶよう移行し、token 必須化する
// =============================================================

export async function getTemplateByCode(
  code: CmContractTemplateCode,
  token?: string,
): Promise<ActionResult<CmContractTemplate>> {
  try {
    if (token) {
      await requireCmSession(token);
    }

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
  } catch (error) {
    return handleActionError(error, 'テンプレート取得エラー');
  }
}

// =============================================================
// テンプレート更新（書き込み操作 → token 必須）
// =============================================================

export async function updateTemplate(
  code: CmContractTemplateCode,
  htmlContent: string,
  token: string,
): Promise<ActionResult> {
  try {
    const auth = await requireCmSession(token);

    logger.info('テンプレート更新開始', { code, userId: auth.userId });

    const { error } = await supabaseAdmin
      .from('cm_contract_templates')
      .update({ 
        html_content: htmlContent,
        updated_by: auth.userId,
      })
      .eq('code', code);

    if (error) {
      logger.error('テンプレート更新エラー', { code, message: error.message });
      return { ok: false, error: '更新に失敗しました' };
    }

    logger.info('テンプレート更新完了', { code, userId: auth.userId });
    return { ok: true };
  } catch (error) {
    return handleActionError(error, 'テンプレート更新エラー');
  }
}

// =============================================================
// 有効なテンプレート一覧取得（契約作成用）
// ※ Server Component からも呼ばれるため token はオプション
// TODO: Server Component は lib関数を直接呼ぶよう移行し、token 必須化する
// =============================================================

export async function getActiveTemplates(token?: string): Promise<ActionResult<CmContractTemplateListItem[]>> {
  try {
    if (token) {
      await requireCmSession(token);
    }

    const { data, error } = await supabaseAdmin
      .from('cm_contract_templates')
      .select('id, code, name, is_required, sort_order, is_active, updated_at, updated_by')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return { ok: false, error: 'テンプレートの取得に失敗しました' };
    }

    return { ok: true, data: (data ?? []) as CmContractTemplateListItem[] };
  } catch (error) {
    return handleActionError(error, 'テンプレート一覧取得エラー');
  }
}