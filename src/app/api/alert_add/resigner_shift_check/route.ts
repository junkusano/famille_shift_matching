// /src/app/api/alert_add/resigner_shift_check/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { assertCronAuth, ensureSystemAlert } from '../_shared';

type RemovedUser = { user_id: string };
type ShiftRow = {
  shift_id: number;
  shift_start_date: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
};

function todayInJst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function findFutureShiftsWithUsers(removedIds: string[], dateFrom: string): Promise<Map<string, ShiftRow[]>> {
  const result = new Map<string, ShiftRow[]>();
  if (!removedIds.length) return result;
  const cols: (keyof ShiftRow)[] = ['staff_01_user_id', 'staff_02_user_id', 'staff_03_user_id'];

  for (const col of cols) {
    const { data, error } = await supabaseAdmin
      .from('shift')
      .select('shift_id, shift_start_date, staff_01_user_id, staff_02_user_id, staff_03_user_id')
      .gte('shift_start_date', dateFrom)
      .in(col as string, removedIds)
      .limit(5000);

    if (error) throw error;

    for (const row of (data ?? []) as ShiftRow[]) {
      const candidates = [row.staff_01_user_id, row.staff_02_user_id, row.staff_03_user_id]
        .filter((v): v is string => !!v && removedIds.includes(v));
      for (const uid of candidates) {
        const list = result.get(uid) ?? [];
        if (!list.some((r) => r.shift_id === row.shift_id)) list.push(row);
        result.set(uid, list);
      }
    }
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
    const debug = req.nextUrl.searchParams.get('debug') === '1';
    const today = todayInJst();

    const { data: removedUsers, error: userErr } = await supabaseAdmin
      .from('user_entry_united_view_single')
      .select('user_id')
      .eq('status', 'removed_from_lineworks_kaipoke')
      .limit(5000);
    if (userErr) throw userErr;

    const removedIds = (removedUsers ?? []).map((u: RemovedUser) => u.user_id).filter(Boolean);
    console.log('[resigner][users]', { count: removedIds.length });

    const map = await findFutureShiftsWithUsers(removedIds, today);

    let created = 0;
    let matchedShifts = 0;

    for (const [uid, shifts] of map.entries()) {
      if (!shifts?.length) continue;
      matchedShifts += shifts.length;

      const ymFirst = today.slice(0, 7) + '-01';
      const link = `/portal/shift-view?user_id=${encodeURIComponent(uid)}&date=${ymFirst}&per=50&page=1`;
      const message = `【要確認】退職者 user_id=${uid} が今後のシフトに残っています。一覧: ${link}`;

      const res = await ensureSystemAlert({
        message,
        severity: 3,
        visible_roles: ['manager'],
        kaipoke_cs_id: null,
      });
      if (res.created) created++;
    }

    const diag = debug
      ? { sample: Array.from(map.entries()).slice(0, 3).map(([u, s]) => ({ u, shift_ids: s.map(v => v.shift_id) })) }
      : undefined;

    return NextResponse.json(
      { ok: true, scanned_users: removedIds.length, matched_shifts: matchedShifts, created_alerts: created, ...diag },
      { status: 200 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[resigner] fatal', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
