// /src/app/api/alert_add/shift_record_unfinish_check/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;


import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
// ← 置き場所が alert_add 配下なので、_shared は 1 つ上の階層
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

type ApiBody =
  | { ok: true; scanned: number; matched: number; created: number; boundary_date: string }
  | { ok: false; error: string };

function ymdInJst(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d); // YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    // “現時点から3日以前 かつ 2025-10-01 以降”の範囲でチェック
    const threeDaysAgoJst = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const d3 = ymdInJst(threeDaysAgoJst);
    const hardMin = '2025-10-01';
    // 境界 = MAX(2025-10-01, 今日-3日) の “以前”
    const boundary = d3 < hardMin ? hardMin : d3;

    // record_status が submitted 以外（含むNULL）
    // かつ shift_start_date <= boundary
    // かつ shift_start_date >= 2025-10-01
    // かつ kaipoke_cs_id が '99999999%' で始まらない
    const { data, error } = await supabaseAdmin
      .from('shift_shift_record_view')
      .select(
        'shift_id, shift_start_date, shift_start_time, record_status, staff_01_user_id, staff_02_user_id, staff_03_user_id, kaipoke_cs_id'
      )
      .lte('shift_start_date', boundary)
      .gte('shift_start_date', hardMin)
      .not('kaipoke_cs_id', 'like', '99999999%')
      .or('record_status.is.null,record_status.neq.submitted')
      .limit(5000);

    if (error) throw error;

    const rows: Row[] = (data ?? []) as Row[];

    let created = 0;
    let matched = 0;

    for (const r of rows) {
      matched++;

      const ymd = r.shift_start_date ?? '????-??-??';
      const hm = (r.shift_start_time ?? '').slice(0, 5);
      const staffList =
        [r.staff_01_user_id, r.staff_02_user_id, r.staff_03_user_id].filter(Boolean).join(', ') ||
        '（担当未設定）';

      // 月初を基準に一覧へ飛ぶ
      const ymFirst = (ymd.length >= 7 ? ymd.slice(0, 7) : '1970-01') + '-01';
      const listLink = `/portal/shift-view?date=${ymFirst}&per=50&page=1`;

      const message =
        `【要提出】shift_id=${r.shift_id} の実施記録が未提出です（${ymd} ${hm} 開始, 担当: ${staffList}）。` +
        `一覧: ${listLink}`;

      const res = await ensureSystemAlert({
        message,
        severity: 2,
        visible_roles: ['manager', 'staff'],
        kaipoke_cs_id: null, // 利用者紐付けなし
      });

      if (res.created) created++;
    }

    const body: ApiBody = { ok: true, scanned: rows.length, matched, created, boundary_date: boundary };
    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const body: ApiBody = { ok: false, error: msg };
    return NextResponse.json(body, { status: 500 });
  }
}
