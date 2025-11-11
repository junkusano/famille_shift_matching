// /src/app/api/alert_add/shift_record_unfinish_check/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { assertCronAuth, ensureSystemAlert } from '../_shared';

type Row = {
  shift_id: number;
  shift_start_date: string | null;
  shift_start_time: string | null;
  record_status: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  kaipoke_cs_id: string | null;
};

function ymdInJst(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export async function GET(req: NextRequest) {
  try {
    //assertCronAuth(req);
    void assertCronAuth;
    const debug = req.nextUrl.searchParams.get('debug') === '1';

    const threeDaysAgoJst = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const d3 = ymdInJst(threeDaysAgoJst);
    const hardMin = '2025-10-01';
    const boundary = d3 < hardMin ? hardMin : d3;

    console.log('[shift_record][fetch] boundary', { hardMin, d3, boundary });

    const { data, error } = await supabaseAdmin
      .from('shift_shift_record_view')
      .select('shift_id, shift_start_date, shift_start_time, record_status, staff_01_user_id, staff_02_user_id, staff_03_user_id, kaipoke_cs_id')
      .lte('shift_start_date', boundary)
      .gte('shift_start_date', hardMin)
      .or('kaipoke_cs_id.is.null,kaipoke_cs_id.not.like.99999999%')
      .or('record_status.is.null,record_status.neq.submitted')
      .limit(5000);

    if (error) {
      console.error('[shift_record][fetch] error', error);
      throw error;
    }

    const rows: Row[] = (data ?? []) as Row[];
    console.log('[shift_record][fetch] rows', { count: rows.length });

    let created = 0;
    for (const r of rows) {
      const ymd = r.shift_start_date ?? '????-??-??';
      const hm = (r.shift_start_time ?? '').slice(0, 5);
      const staffList = [r.staff_01_user_id, r.staff_02_user_id, r.staff_03_user_id].filter(Boolean).join(', ') || '（担当未設定）';
      const ymFirst = (ymd.length >= 7 ? ymd.slice(0, 7) : '1970-01') + '-01';
      const listLink = `/portal/shift-view?date=${ymFirst}&per=50&page=1`;

      const message = `【要提出】shift_id=${r.shift_id} の実施記録が未提出です（${ymd} ${hm} 開始, 担当: ${staffList}）。一覧: ${listLink}`;

      const res = await ensureSystemAlert({
        message,
        severity: 2,
        visible_roles: ['manager', 'staff'],
        kaipoke_cs_id: null,
      });
      if (res.created) created++;
    }

    const diag = debug
      ? { sample: rows.slice(0, 5).map(r => ({ id: r.shift_id, date: r.shift_start_date, status: r.record_status, kcid: r.kaipoke_cs_id })) }
      : undefined;

    return NextResponse.json(
      { ok: true, scanned: rows.length, matched: rows.length, created, boundary_date: boundary, ...diag },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[shift_record] fatal', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
