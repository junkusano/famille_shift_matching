// =============================================================
// src/app/api/cm/service-credentials/route.ts
// サービス認証情報 一覧取得・新規作成API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { clearCredentialsCache } from '@/lib/cm/serviceCredentials';
import type {
  CmServiceCredential,
  CmServiceCredentialMasked,
} from '@/types/cm/serviceCredentials';

const logger = createLogger('cm/api/service-credentials');

/**
 * 機密情報をマスクする
 */
function maskCredentials(credentials: Record<string, unknown>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (value === null || value === undefined) {
      masked[key] = '';
    } else if (typeof value === 'string') {
      // 文字列は最初の4文字以外をマスク
      if (value.length <= 4) {
        masked[key] = '****';
      } else {
        masked[key] = value.substring(0, 4) + '****';
      }
    } else {
      masked[key] = '****';
    }
  }
  return masked;
}

// =============================================================
// GET: 一覧取得（機密情報マスク済み）
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const showInactive = searchParams.get('showInactive') === 'true';
    const serviceName = searchParams.get('serviceName') || '';

    logger.info('サービス認証情報一覧取得', { showInactive, serviceName });

    let query = supabaseAdmin
      .from('cm_rpa_credentials')
      .select('*')
      .order('service_name', { ascending: true });

    if (!showInactive) {
      query = query.eq('is_active', true);
    }

    if (serviceName) {
      query = query.ilike('service_name', `%${serviceName}%`);
    }

    const { data: entries, error } = await query;

    if (error) {
      logger.error('サービス認証情報取得エラー', error);
      return NextResponse.json({ ok: false, error: 'データ取得に失敗しました' }, { status: 500 });
    }

    // 機密情報をマスク
    const maskedEntries: CmServiceCredentialMasked[] = (entries || []).map((entry) => {
      const credentials = entry.credentials as Record<string, unknown>;
      return {
        id: entry.id,
        service_name: entry.service_name,
        label: entry.label,
        is_active: entry.is_active,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        credentials_masked: maskCredentials(credentials),
        credentials_keys: Object.keys(credentials),
      };
    });

    logger.info('サービス認証情報取得完了', { count: maskedEntries.length });

    return NextResponse.json({
      ok: true,
      entries: maskedEntries,
    });
  } catch (error) {
    logger.error('サービス認証情報取得API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// =============================================================
// POST: 新規作成
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { service_name, label, credentials, is_active } = body;

    // バリデーション
    if (!service_name || typeof service_name !== 'string' || service_name.trim() === '') {
      return NextResponse.json({ ok: false, error: 'サービス名は必須です' }, { status: 400 });
    }

    if (!credentials || typeof credentials !== 'object') {
      return NextResponse.json({ ok: false, error: '認証情報は必須です' }, { status: 400 });
    }

    // サービス名の重複チェック
    const { data: existing } = await supabaseAdmin
      .from('cm_rpa_credentials')
      .select('id')
      .eq('service_name', service_name.trim())
      .single();

    if (existing) {
      return NextResponse.json({ ok: false, error: 'このサービス名は既に登録されています' }, { status: 400 });
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
      return NextResponse.json({ ok: false, error: 'データベースへの登録に失敗しました' }, { status: 500 });
    }

    // キャッシュをクリア
    clearCredentialsCache(service_name.trim());

    logger.info('サービス認証情報新規作成完了', { id: entry.id });

    return NextResponse.json({
      ok: true,
      entry: entry as CmServiceCredential,
    });
  } catch (error) {
    logger.error('サービス認証情報作成API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
