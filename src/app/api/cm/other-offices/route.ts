// =============================================================
// src/app/api/cm/other-offices/route.ts
// 他社事業所一覧取得API
//
// 【修正】FAX番号検索のハイフン混在対応
// - 単純なilike検索からワイルドカードパターン検索に変更
// - 入力: 0312345678 → DB: 03-1234-5678 でもマッチ
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { buildFaxSearchPattern, normalizeFaxNumber } from '@/lib/cm/faxNumberUtils';

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

    logger.info('他社事業所検索', { officeName, faxNumber, serviceType });

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
    
    // 【修正】FAX番号検索（ハイフン混在対応）
    if (faxNumber) {
      // 入力を正規化（数字のみに）
      const normalized = normalizeFaxNumber(faxNumber);
      
      if (normalized && normalized.length >= 4) {
        // ワイルドカードパターンを生成
        const wildcardPattern = buildFaxSearchPattern(normalized);
        
        if (wildcardPattern) {
          // ワイルドカード検索（ハイフン混在対応）
          query = query.or(`fax.ilike.${wildcardPattern},fax_proxy.ilike.${wildcardPattern}`);
          logger.info('FAX検索パターン', { input: faxNumber, pattern: wildcardPattern });
        } else {
          // 短すぎる場合は部分一致
          query = query.or(`fax.ilike.%${normalized}%,fax_proxy.ilike.%${normalized}%`);
        }
      } else {
        // 正規化できない場合は元の値で検索
        query = query.or(`fax.ilike.%${faxNumber}%,fax_proxy.ilike.%${faxNumber}%`);
      }
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
      .not('service_type', 'is', null);

    const serviceTypes = [...new Set(
      (serviceTypesData || [])
        .map((d) => d.service_type)
        .filter((s): s is string => s !== null)
    )].sort();

    // ページネーション情報
    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    logger.info('他社事業所取得完了', { count: offices?.length, total });

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
    logger.error('他社事業所取得API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}