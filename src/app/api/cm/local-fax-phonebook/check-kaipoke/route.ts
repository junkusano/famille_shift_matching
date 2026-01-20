// =============================================================
// src/app/api/cm/local-fax-phonebook/check-kaipoke/route.ts
// FAX番号でカイポケ登録情報をチェックするAPI
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { normalizeFaxNumber } from '@/lib/cm/faxNumberUtils';
import type { CmKaipokeOfficeInfo } from '@/types/cm/localFaxPhonebook';

const logger = createLogger('cm/api/local-fax-phonebook/check-kaipoke');

// =============================================================
// GET: FAX番号でカイポケ登録情報をチェック
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const faxNumber = searchParams.get('faxNumber') || '';

    if (!faxNumber) {
      return NextResponse.json({
        ok: true,
        offices: [],
      });
    }

    const normalizedFax = normalizeFaxNumber(faxNumber);

    if (!normalizedFax || normalizedFax.length < 4) {
      return NextResponse.json({
        ok: true,
        offices: [],
      });
    }

    logger.info('カイポケ登録チェック', { faxNumber, normalizedFax });

    // cm_kaipoke_other_officeからFAX番号でマッチング
    const { data: kaipokeOffices, error } = await supabaseAdmin
      .from('cm_kaipoke_other_office')
      .select('id, office_name, service_type, office_number, fax, fax_proxy')
      .not('fax', 'is', null);

    if (error) {
      logger.error('カイポケ事業所取得エラー', error);
      return NextResponse.json({ ok: false, error: 'データ取得に失敗しました' }, { status: 500 });
    }

    // FAX番号がマッチする事業所を抽出
    const matchedOffices: CmKaipokeOfficeInfo[] = [];

    for (const office of kaipokeOffices || []) {
      const officeFaxNormalized = office.fax ? normalizeFaxNumber(office.fax) : null;
      const officeProxyNormalized = office.fax_proxy ? normalizeFaxNumber(office.fax_proxy) : null;

      if (
        (officeFaxNormalized && officeFaxNormalized === normalizedFax) ||
        (officeProxyNormalized && officeProxyNormalized === normalizedFax)
      ) {
        matchedOffices.push({
          id: office.id,
          office_name: office.office_name,
          service_type: office.service_type,
          office_number: office.office_number,
        });
      }
    }

    logger.info('カイポケ登録チェック完了', { matchedCount: matchedOffices.length });

    return NextResponse.json({
      ok: true,
      offices: matchedOffices,
    });
  } catch (error) {
    logger.error('カイポケチェックAPI予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}