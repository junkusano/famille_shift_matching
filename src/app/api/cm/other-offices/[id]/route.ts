// =============================================================
// src/app/api/cm/other-offices/[id]/route.ts
// 他社事業所更新API（FAX代行番号のみ編集可能）
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';

const logger = createLogger('cm/api/other-offices/[id]');

/**
 * FAX代行番号の更新
 */
export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;

    // リクエストボディの取得
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'リクエストボディが不正です' }, { status: 400 });
    }

    const { fax_proxy } = body;

    // fax_proxy のバリデーション（nullまたは文字列のみ許可）
    if (fax_proxy !== null && typeof fax_proxy !== 'string') {
      return NextResponse.json({ ok: false, error: 'fax_proxy は文字列またはnullである必要があります' }, { status: 400 });
    }

    // FAX番号の形式チェック（空文字はnullに変換）
    const normalizedFaxProxy = fax_proxy === '' ? null : fax_proxy;

    // 更新実行（supabaseAdminを使用）
    const { data: updatedOffice, error: updateError } = await supabaseAdmin
      .from('cm_kaipoke_other_office')
      .update({ 
        fax_proxy: normalizedFaxProxy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return NextResponse.json({ ok: false, error: '指定された事業所が見つかりません' }, { status: 404 });
      }
      logger.error('他社事業所更新エラー', updateError, { id });
      return NextResponse.json({ ok: false, error: '更新に失敗しました' }, { status: 500 });
    }

    logger.info('他社事業所FAX代行番号を更新', { 
      id, 
      office_name: updatedOffice.office_name,
      fax_proxy: normalizedFaxProxy,
    });

    return NextResponse.json({
      ok: true,
      office: updatedOffice,
    });

  } catch (error) {
    logger.error('他社事業所更新API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

/**
 * 単一事業所の取得
 */
export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;

    // データ取得
    const { data: office, error: queryError } = await supabaseAdmin
      .from('cm_kaipoke_other_office')
      .select('*')
      .eq('id', id)
      .single();

    if (queryError) {
      if (queryError.code === 'PGRST116') {
        return NextResponse.json({ ok: false, error: '指定された事業所が見つかりません' }, { status: 404 });
      }
      logger.error('他社事業所取得エラー', queryError, { id });
      return NextResponse.json({ ok: false, error: 'データ取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      office,
    });

  } catch (error) {
    logger.error('他社事業所取得API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}