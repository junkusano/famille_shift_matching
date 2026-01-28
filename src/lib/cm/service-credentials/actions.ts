// =============================================================
// src/lib/cm/service-credentials/actions.ts
// サービス認証情報 Server Actions（CRUD操作）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { clearCredentialsCache } from "@/lib/cm/serviceCredentials";
import { revalidatePath } from "next/cache";
import type { CmServiceCredential } from "@/types/cm/serviceCredentials";

const logger = createLogger("lib/cm/service-credentials/actions");

// =============================================================
// Types
// =============================================================

export type ActionResult<T = void> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

// =============================================================
// 個別取得（編集用、認証情報を含む）
// =============================================================

export async function fetchServiceCredential(
  id: number
): Promise<ActionResult<CmServiceCredential>> {
  try {
    if (isNaN(id)) {
      return { ok: false, error: '無効なIDです' };
    }

    logger.info('サービス認証情報個別取得', { id });

    const { data: entry, error } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { ok: false, error: 'データが見つかりません' };
      }
      logger.error('サービス認証情報取得エラー', error);
      return { ok: false, error: 'データ取得に失敗しました' };
    }

    return { ok: true, data: entry as CmServiceCredential };
  } catch (error) {
    logger.error('サービス認証情報取得予期せぬエラー', error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}

// =============================================================
// 新規作成
// =============================================================

export async function createServiceCredential(data: {
  service_name: string;
  label?: string | null;
  credentials: Record<string, unknown>;
  is_active?: boolean;
}): Promise<ActionResult<CmServiceCredential>> {
  try {
    const { service_name, label, credentials, is_active } = data;

    // バリデーション
    if (!service_name || typeof service_name !== 'string' || service_name.trim() === '') {
      return { ok: false, error: 'サービス名は必須です' };
    }

    if (!credentials || typeof credentials !== 'object') {
      return { ok: false, error: '認証情報は必須です' };
    }

    // サービス名の重複チェック
    const { data: existing } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('id')
      .eq('service_name', service_name.trim())
      .single();

    if (existing) {
      return { ok: false, error: 'このサービス名は既に登録されています' };
    }

    logger.info('サービス認証情報新規作成', { service_name });

    const { data: entry, error: insertError } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .insert({
        service_name: service_name.trim(),
        label: label?.trim() || null,
        credentials,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('サービス認証情報DB登録エラー', insertError);
      return { ok: false, error: 'データベースへの登録に失敗しました' };
    }

    // キャッシュをクリア
    clearCredentialsCache(service_name.trim());

    // ページを再検証
    revalidatePath('/cm-portal/service-credentials');

    logger.info('サービス認証情報新規作成完了', { id: entry.id });

    return { ok: true, data: entry as CmServiceCredential };
  } catch (error) {
    logger.error('サービス認証情報作成予期せぬエラー', error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}

// =============================================================
// 更新
// =============================================================

export async function updateServiceCredential(
  id: number,
  data: {
    service_name?: string;
    label?: string | null;
    credentials?: Record<string, unknown>;
    is_active?: boolean;
  }
): Promise<ActionResult<CmServiceCredential>> {
  try {
    if (isNaN(id)) {
      return { ok: false, error: '無効なIDです' };
    }

    const { service_name, label, credentials, is_active } = data;

    logger.info('サービス認証情報更新', { id });

    // 既存レコードを取得
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return { ok: false, error: 'データが見つかりません' };
    }

    // サービス名変更時の重複チェック
    if (service_name && service_name.trim() !== existing.service_name) {
      const { data: duplicate } = await supabaseAdmin
        .from('cm_rpa_credentials')
        .select('id')
        .eq('service_name', service_name.trim())
        .neq('id', id)
        .single();

      if (duplicate) {
        return { ok: false, error: 'このサービス名は既に登録されています' };
      }
    }

    // 更新データを構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (service_name !== undefined) {
      updateData.service_name = service_name.trim();
    }
    if (label !== undefined) {
      updateData.label = label?.trim() || null;
    }
    if (credentials !== undefined) {
      updateData.credentials = credentials;
    }
    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    const { data: entry, error: updateError } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      logger.error('サービス認証情報更新エラー', updateError);
      return { ok: false, error: '更新に失敗しました' };
    }

    // キャッシュをクリア（旧サービス名と新サービス名の両方）
    clearCredentialsCache(existing.service_name);
    if (service_name && service_name.trim() !== existing.service_name) {
      clearCredentialsCache(service_name.trim());
    }

    // ページを再検証
    revalidatePath('/cm-portal/service-credentials');

    logger.info('サービス認証情報更新完了', { id });

    return { ok: true, data: entry as CmServiceCredential };
  } catch (error) {
    logger.error('サービス認証情報更新予期せぬエラー', error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}

// =============================================================
// 削除
// =============================================================

export async function deleteServiceCredential(id: number): Promise<ActionResult> {
  try {
    if (isNaN(id)) {
      return { ok: false, error: '無効なIDです' };
    }

    logger.info('サービス認証情報削除', { id });

    // 既存レコードを取得（キャッシュクリア用）
    const { data: existing } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('service_name')
      .eq('id', id)
      .single();

    const { error: deleteError } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logger.error('サービス認証情報削除エラー', deleteError);
      return { ok: false, error: '削除に失敗しました' };
    }

    // キャッシュをクリア
    if (existing) {
      clearCredentialsCache(existing.service_name);
    }

    // ページを再検証
    revalidatePath('/cm-portal/service-credentials');

    logger.info('サービス認証情報削除完了', { id });

    return { ok: true };
  } catch (error) {
    logger.error('サービス認証情報削除予期せぬエラー', error);
    return { ok: false, error: 'サーバーエラーが発生しました' };
  }
}
