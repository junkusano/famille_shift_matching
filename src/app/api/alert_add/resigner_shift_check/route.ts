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

type ApiBody =
  | { ok: true; scanned_users: number; matched_shifts: number; created_alerts: number }
  | { ok: false; error: string };

/** JSTの“今日”を YYYY-MM-DD で取得 */
function todayInJst(): string {
  // en-CA は YYYY-MM-DD 形式
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** シフト検索（日付>=today で、指定ユーザーが 1/2/3 に含まれる行）を3列で合算 */
async function findFutureShiftsWithUsers(
  removedIds: string[],
  dateFrom: string,
): Promise<Map<string, ShiftRow[]>> {
  const result = new Map<string, ShiftRow[]>();
  if (removedIds.length === 0) return result;

  // 3列それぞれで in() クエリ（必要件数だけ取りにいく）
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
      // どの user_id が刺さったか特定し、ユーザー別にまとめる
      const candidates = [
        row.staff_01_user_id,
        row.staff_02_user_id,
        row.staff_03_user_id,
      ].filter((v): v is string => !!v && removedIds.includes(v));

      for (const uid of candidates) {
        const list = result.get(uid) ?? [];
        // 同一 shift_id の重複を避ける
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

    const today = todayInJst();

    // 1) 退職者ユーザーの抽出
    const { data: removedUsers, error: userErr } = await supabaseAdmin
      .from('user_entry_united_view_single')
      .select('user_id')
      .eq('status', 'removed_from_lineworks_kaipoke')
      .limit(5000);

    if (userErr) throw userErr;

    const removedIds = (removedUsers ?? []).map((u: RemovedUser) => u.user_id).filter(Boolean);
    if (removedIds.length === 0) {
      const body: ApiBody = { ok: true, scanned_users: 0, matched_shifts: 0, created_alerts: 0 };
      return NextResponse.json(body, { status: 200 });
    }

    // 2) 将来シフトに残っている行をユーザー別に取得
    const map = await findFutureShiftsWithUsers(removedIds, today);

    // 3) アラート作成（ユーザー単位で1件：リンクはユーザー別のシフト一覧）
    let created = 0;
    let matchedShifts = 0;

    for (const [uid, shifts] of map.entries()) {
      if (!shifts || shifts.length === 0) continue;
      matchedShifts += shifts.length;

      // 当月1日（JST）の yyyy-mm-01 をクエリに使う
      const ymFirst = today.slice(0, 7) + '-01';
      const link = `/portal/shift-view?user_id=${encodeURIComponent(uid)}&date=${ymFirst}&per=50&page=1`;

      const message =
        `【要確認】退職者 user_id=${uid} が今後のシフトに残っています。` +
        `一覧: ${link}`;

      const res = await ensureSystemAlert({
        message,
        severity: 3,               // 重要度高
        visible_roles: ['manager'],// 担当者向けに絞る（必要に応じて拡張可）
        kaipoke_cs_id: null,       // 利用者に紐付かないため null
      });
      if (res.created) created++;
    }

    const body: ApiBody = {
      ok: true,
      scanned_users: removedIds.length,
      matched_shifts: matchedShifts,
      created_alerts: created,
    };
    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const body: ApiBody = { ok: false, error: msg };
    return NextResponse.json(body, { status: 500 });
  }
}
