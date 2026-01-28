// =============================================================
// src/app/api/cm/plaud/transcriptions/route.ts
// 文字起こし一覧API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/common/logger';

const logger = createLogger('cm/api/plaud/transcriptions');

// Supabase Admin Client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =============================================================
// GET: 文字起こし一覧取得
// =============================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // クエリパラメータ
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    logger.info('文字起こし一覧取得開始', { page, limit, status, search });

    // クエリ構築
    let query = supabaseAdmin
      .from('cm_plaud_mgmt_transcriptions')
      .select('*', { count: 'exact' });

    // フィルター適用
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    if (dateFrom) {
      query = query.gte('plaud_created_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('plaud_created_at', `${dateTo}T23:59:59`);
    }

    // ページネーション
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query
      .order('plaud_created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      logger.error('取得エラー', { error: error.message });
      return NextResponse.json(
        { ok: false, error: '文字起こしデータの取得に失敗しました' },
        { status: 500 }
      );
    }

    // 利用者名を取得
    const kaipokeCsIds = (data ?? [])
      .map((t) => t.kaipoke_cs_id)
      .filter((id): id is string => id !== null);

    let clientMap = new Map<string, string>();
    if (kaipokeCsIds.length > 0) {
      const { data: clients } = await supabaseAdmin
        .from('cm_kaipoke_info')
        .select('kaipoke_cs_id, name')
        .in('kaipoke_cs_id', kaipokeCsIds);

      clientMap = new Map(
        (clients ?? []).map((c) => [c.kaipoke_cs_id, c.name])
      );
    }

    // client_name を付与
    const transcriptions = (data ?? []).map((t) => ({
      ...t,
      client_name: t.kaipoke_cs_id ? clientMap.get(t.kaipoke_cs_id) ?? null : null,
    }));

    // ステータス別カウント取得
    const { data: countData } = await supabaseAdmin
      .from('cm_plaud_mgmt_transcriptions')
      .select('status');

    const counts = {
      all: countData?.length ?? 0,
      pending: countData?.filter((d) => d.status === 'pending').length ?? 0,
      approved: countData?.filter((d) => d.status === 'approved').length ?? 0,
      completed: countData?.filter((d) => d.status === 'completed').length ?? 0,
      failed: countData?.filter((d) => d.status === 'failed').length ?? 0,
    };

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    logger.info('文字起こし一覧取得完了', { count: transcriptions.length, total });

    return NextResponse.json({
      ok: true,
      transcriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      counts,
    });
  } catch (error) {
    logger.error('予期せぬエラー', error as Error);
    return NextResponse.json(
      { ok: false, error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}