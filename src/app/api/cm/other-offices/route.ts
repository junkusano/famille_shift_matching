// =============================================================
// src/app/api/cm/other-offices/route.ts
// 他社事業所一覧取得API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';

const logger = createLogger('cm/api/other-offices');

// 1ページあたりの件数
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    // クエリパラメータの取得
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10)));
    const serviceType = searchParams.get('serviceType') || '';
    const officeName = searchParams.get('officeName') || '';
    const officeNumber = searchParams.get('officeNumber') || '';
    const faxNumber = searchParams.get('faxNumber') || '';

    // ベースクエリ
    let query = supabaseAdmin
      .from('cm_kaipoke_other_office')
      .select('*', { count: 'exact' });

    // フィルター適用
    if (serviceType) {
      query = query.eq('service_type', serviceType);
    }
    if (officeName) {
      query = query.ilike('office_name', `%${officeName}%`);
    }
    if (officeNumber) {
      query = query.ilike('office_number', `%${officeNumber}%`);
    }
    if (faxNumber) {
      // FAXまたはFAX代行番号で検索
      query = query.or(`fax.ilike.%${faxNumber}%,fax_proxy.ilike.%${faxNumber}%`);
    }

    // ソート（サービス種別 → 事業所名）
    query = query
      .order('service_type', { ascending: true, nullsFirst: false })
      .order('office_name', { ascending: true });

    // ページネーション
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: offices, count, error: queryError } = await query;

    if (queryError) {
      logger.error('他社事業所取得エラー', queryError);
      return NextResponse.json({ ok: false, error: 'データ取得に失敗しました' }, { status: 500 });
    }

    // サービス種別の一覧を取得（フィルター用）
    const { data: serviceTypesData } = await supabaseAdmin
      .from('cm_kaipoke_other_office')
      .select('service_type')
      .not('service_type', 'is', null)
      .order('service_type', { ascending: true });

    // 重複を除去してユニークなサービス種別リストを作成
    const serviceTypes = [...new Set(
      (serviceTypesData || [])
        .map(row => row.service_type)
        .filter((v): v is string => v !== null)
    )];

    // ページネーション情報
    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      ok: true,
      offices: offices || [],
      serviceTypes,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });

  } catch (error) {
    logger.error('他社事業所API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}