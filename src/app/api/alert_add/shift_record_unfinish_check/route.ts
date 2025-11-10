// /src/app/api/shift_record_unfinish_check/route.ts
export const runtime = 'nodejs';

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
};

type ApiBody =
  | { ok: true; scanned: number; matched: number; created: number }
  | { ok: false; error: string };

function todayInJst(): Date {
  // JST now
  const now = new Date();
  // toTimeString offsetもあるが、ここは3日差の“日付しきい値”用途のためUTC→JST換算はIntl側で行う
  return now;
}

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

    // JST「3日前」の“日付”を境界に採用（≒ 現時点から3日以前）
    const nowJst = todayInJst();
    const threeDaysAgo = new Date(nowJst.getTime() - 3 * 24 * 60 * 60 * 1000);
    const boundaryDate = ymdInJst(threeDaysAgo); // YYYY-MM-DD

    // record_status が submitted 以外（含む NULL）かつ、境界日付以前のシフト
    const { data, error } = await supabaseAdmin
      .from('shift_shift_record_view')
      .select(
        'shift_id, shift_start_date, shift_start_time, record_status, staff_01_user_id, staff_02_user_id, staff_03_user_id'
      )
      .lte('shift_start_date', boundaryDate)
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
      const staffList = [r.staff_01_user_id, r.staff_02_user_id, r.staff_03_user_id]
        .filter(Boolean)
        .join(', ') || '（担当未設定）';

      // 月初を基準に一覧へ飛ぶ（既存のビューURL仕様に合わせる）
      const ymFirst = (ymd.length >= 7 ? ymd.slice(0, 7) : '1970-01') + '-01';
      const listLink = `/portal/shift-view?date=${ymFirst}&per=50&page=1`;

      const message =
        `【要提出】shift_id=${r.shift_id} の実施記録が未提出です（${ymd} ${hm} 開始, 担当: ${staffList}）。` +
        `一覧: ${listLink}`;

      const res = await ensureSystemAlert({
        message,
        severity: 2,
        visible_roles: ['manager', 'staff'],
        // 利用者単位ではないため cs_id は紐付けない
        kaipoke_cs_id: null,
      });

      if (res.created) created++;
    }

    const body: ApiBody = { ok: true, scanned: rows.length, matched, created };
    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const body: ApiBody = { ok: false, error: msg };
    return NextResponse.json(body, { status: 500 });
  }
}
