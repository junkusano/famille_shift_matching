// =============================================================
// src/app/api/cm/local-fax-phonebook/route.ts
// ローカルFAX電話帳 一覧取得・新規作成API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { normalizeFaxNumber } from '@/lib/cm/faxNumberUtils';
import { getServiceUrl, SERVICE_NAMES } from '@/lib/cm/serviceCredentials';
import type {
  CmLocalFaxPhonebookEntry,
  CmLocalFaxPhonebookPagination,
  CmPhonebookGasAddRequest,
  CmPhonebookGasAddResponse,
  CmKaipokeOfficeInfo,
  CmLocalFaxPhonebookEntryWithKaipoke,
} from '@/types/cm/localFaxPhonebook';

const logger = createLogger('cm/api/local-fax-phonebook');

// 1ページあたりの件数
const DEFAULT_LIMIT = 50;

// =============================================================
// カイポケ登録情報を取得するヘルパー関数
// =============================================================
async function getKaipokeInfoByFaxNumbers(
  faxNumbersNormalized: string[]
): Promise<Map<string, CmKaipokeOfficeInfo[]>> {
  const result = new Map<string, CmKaipokeOfficeInfo[]>();
  
  if (faxNumbersNormalized.length === 0) {
    return result;
  }

  // FAX番号またはFAX代行番号でマッチング（正規化済み）
  // cm_kaipoke_other_officeのfaxカラムはハイフン付きの可能性があるため、
  // 正規化して比較する
  const { data: kaipokeOffices, error } = await supabaseAdmin
    .from('cm_kaipoke_other_office')
    .select('id, office_name, service_type, office_number, fax, fax_proxy')
    .not('fax', 'is', null);

  if (error) {
    logger.error('カイポケ事業所取得エラー', error);
    return result;
  }

  // FAX番号ごとにマッチする事業所をグルーピング
  for (const office of kaipokeOffices || []) {
    const officeFaxNormalized = office.fax ? normalizeFaxNumber(office.fax) : null;
    const officeProxyNormalized = office.fax_proxy ? normalizeFaxNumber(office.fax_proxy) : null;

    for (const targetFax of faxNumbersNormalized) {
      if (
        (officeFaxNormalized && officeFaxNormalized === targetFax) ||
        (officeProxyNormalized && officeProxyNormalized === targetFax)
      ) {
        const info: CmKaipokeOfficeInfo = {
          id: office.id,
          office_name: office.office_name,
          service_type: office.service_type,
          office_number: office.office_number,
        };

        if (!result.has(targetFax)) {
          result.set(targetFax, []);
        }
        result.get(targetFax)!.push(info);
      }
    }
  }

  return result;
}

// =============================================================
// GET: 一覧取得
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10)));
    const name = searchParams.get('name') || '';
    const faxNumber = searchParams.get('faxNumber') || '';
    const showInactive = searchParams.get('showInactive') === 'true';

    logger.info('ローカルFAX電話帳検索', { name, faxNumber, showInactive, page });

    // ベースクエリ
    let query = supabaseAdmin
      .from('cm_local_fax_phonebook')
      .select('*', { count: 'exact' });

    // フィルター適用
    if (!showInactive) {
      query = query.eq('is_active', true);
    }

    if (name) {
      // 事業所名または読み仮名で部分一致検索
      query = query.or(`name.ilike.%${name}%,name_kana.ilike.%${name}%`);
    }

    if (faxNumber) {
      // FAX番号検索（正規化して比較）
      const normalized = normalizeFaxNumber(faxNumber);
      if (normalized) {
        query = query.or(`fax_number.ilike.%${faxNumber}%,fax_number_normalized.ilike.%${normalized}%`);
      } else {
        query = query.ilike('fax_number', `%${faxNumber}%`);
      }
    }

    // ソート（読み仮名 → 事業所名）
    query = query
      .order('name_kana', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });

    // ページネーション
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data: entries, count, error: queryError } = await query;

    if (queryError) {
      logger.error('ローカルFAX電話帳取得エラー', queryError);
      return NextResponse.json({ ok: false, error: 'データ取得に失敗しました' }, { status: 500 });
    }

    // カイポケ登録情報を取得
    const faxNumbersNormalized = (entries || [])
      .map((e) => e.fax_number_normalized)
      .filter((fax): fax is string => fax !== null && fax !== '');

    const kaipokeMap = await getKaipokeInfoByFaxNumbers(faxNumbersNormalized);

    // エントリにカイポケ情報を付加
    const entriesWithKaipoke: CmLocalFaxPhonebookEntryWithKaipoke[] = (entries || []).map((entry) => {
      const kaipokeInfo = entry.fax_number_normalized
        ? kaipokeMap.get(entry.fax_number_normalized) || []
        : [];
      return {
        ...entry,
        kaipoke_offices: kaipokeInfo,
      } as CmLocalFaxPhonebookEntryWithKaipoke;
    });

    // ページネーション情報
    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    const pagination: CmLocalFaxPhonebookPagination = {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    logger.info('ローカルFAX電話帳取得完了', { count: entries?.length, total });

    return NextResponse.json({
      ok: true,
      entries: entriesWithKaipoke,
      pagination,
    });
  } catch (error) {
    logger.error('ローカルFAX電話帳取得API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// =============================================================
// POST: 新規作成
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, name_kana, fax_number, notes } = body;

    // バリデーション
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ ok: false, error: '事業所名は必須です' }, { status: 400 });
    }

    logger.info('ローカルFAX電話帳新規作成', { name, fax_number });

    // FAX番号の正規化
    const faxNormalized = fax_number ? normalizeFaxNumber(fax_number) : null;

    // GAS Web App経由でXMLに追加（source_idを取得）
    let sourceId: string | null = null;
    
    // DBから GAS URL を取得
    const gasWebAppUrl = await getServiceUrl(SERVICE_NAMES.LOCAL_FAX_PHONEBOOK_GAS);
    
    if (gasWebAppUrl) {
      try {
        const gasRequest: CmPhonebookGasAddRequest = {
          action: 'add',
          name: name.trim(),
          name_kana: name_kana?.trim() || undefined,
          fax_number: fax_number?.trim() || undefined,
        };

        const gasResponse = await fetch(gasWebAppUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gasRequest),
        });

        const gasResult: CmPhonebookGasAddResponse = await gasResponse.json();

        if (!gasResult.ok) {
          logger.error('GAS API追加エラー', { error: gasResult.error });
          return NextResponse.json({ ok: false, error: gasResult.error || 'XMLへの追加に失敗しました' }, { status: 500 });
        }

        sourceId = gasResult.source_id || null;
        logger.info('GAS API追加成功', { sourceId });
      } catch (gasError) {
        logger.error('GAS API通信エラー', gasError);
        return NextResponse.json({ ok: false, error: 'XMLサーバーとの通信に失敗しました' }, { status: 500 });
      }
    } else {
      logger.warn('GAS URLが未設定のためXML追加をスキップ');
    }

    // DBに登録
    const { data: entry, error: insertError } = await supabaseAdmin
      .from('cm_local_fax_phonebook')
      .insert({
        name: name.trim(),
        name_kana: name_kana?.trim() || null,
        fax_number: fax_number?.trim() || null,
        fax_number_normalized: faxNormalized,
        source_id: sourceId,
        notes: notes?.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      logger.error('ローカルFAX電話帳DB登録エラー', insertError);
      return NextResponse.json({ ok: false, error: 'データベースへの登録に失敗しました' }, { status: 500 });
    }

    logger.info('ローカルFAX電話帳新規作成完了', { id: entry.id, sourceId });

    return NextResponse.json({
      ok: true,
      entry: entry as CmLocalFaxPhonebookEntry,
    });
  } catch (error) {
    logger.error('ローカルFAX電話帳作成API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}