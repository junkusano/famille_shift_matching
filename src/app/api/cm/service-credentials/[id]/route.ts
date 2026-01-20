// =============================================================
// src/app/api/cm/service-credentials/[id]/route.ts
// サービス認証情報 個別取得・更新・削除API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { clearCredentialsCache } from '@/lib/cm/serviceCredentials';
import type { CmServiceCredential } from '@/types/cm/serviceCredentials';

const logger = createLogger('cm/api/service-credentials/[id]');

type RouteParams = {
  params: Promise<{ id: string }>;
};

// =============================================================
// GET: 個別取得（認証情報を含む - 編集用）
// =============================================================
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const url = req.url; // ESLint対策
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ ok: false, error: '無効なIDです' }, { status: 400 });
    }

    logger.info('サービス認証情報個別取得', { id: numericId, url });

    const { data: entry, error } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('*')
      .eq('id', numericId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ ok: false, error: 'データが見つかりません' }, { status: 404 });
      }
      logger.error('サービス認証情報取得エラー', error);
      return NextResponse.json({ ok: false, error: 'データ取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      entry: entry as CmServiceCredential,
    });
  } catch (error) {
    logger.error('サービス認証情報取得API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// =============================================================
// PATCH: 更新
// =============================================================
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ ok: false, error: '無効なIDです' }, { status: 400 });
    }

    const body = await request.json();
    const { service_name, label, credentials, is_active } = body;

    logger.info('サービス認証情報更新', { id: numericId });

    // 既存レコードを取得
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('*')
      .eq('id', numericId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ ok: false, error: 'データが見つかりません' }, { status: 404 });
    }

    // サービス名変更時の重複チェック
    if (service_name && service_name.trim() !== existing.service_name) {
      const { data: duplicate } = await supabaseAdmin
        .from('cm_rpa_credentials')
        .select('id')
        .eq('service_name', service_name.trim())
        .neq('id', numericId)
        .single();

      if (duplicate) {
        return NextResponse.json({ ok: false, error: 'このサービス名は既に登録されています' }, { status: 400 });
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
      .eq('id', numericId)
      .select()
      .single();

    if (updateError) {
      logger.error('サービス認証情報更新エラー', updateError);
      return NextResponse.json({ ok: false, error: '更新に失敗しました' }, { status: 500 });
    }

    // キャッシュをクリア（旧サービス名と新サービス名の両方）
    clearCredentialsCache(existing.service_name);
    if (service_name && service_name.trim() !== existing.service_name) {
      clearCredentialsCache(service_name.trim());
    }

    logger.info('サービス認証情報更新完了', { id: numericId });

    return NextResponse.json({
      ok: true,
      entry: entry as CmServiceCredential,
    });
  } catch (error) {
    logger.error('サービス認証情報更新API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// =============================================================
// DELETE: 削除
// =============================================================
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const url = req.url; // ESLint対策
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ ok: false, error: '無効なIDです' }, { status: 400 });
    }

    logger.info('サービス認証情報削除', { id: numericId, url });

    // 既存レコードを取得（キャッシュクリア用）
    const { data: existing } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('service_name')
      .eq('id', numericId)
      .single();

    const { error: deleteError } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .delete()
      .eq('id', numericId);

    if (deleteError) {
      logger.error('サービス認証情報削除エラー', deleteError);
      return NextResponse.json({ ok: false, error: '削除に失敗しました' }, { status: 500 });
    }

    // キャッシュをクリア
    if (existing) {
      clearCredentialsCache(existing.service_name);
    }

    logger.info('サービス認証情報削除完了', { id: numericId });

    return NextResponse.json({
      ok: true,
      deletedId: numericId,
    });
  } catch (error) {
    logger.error('サービス認証情報削除API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}