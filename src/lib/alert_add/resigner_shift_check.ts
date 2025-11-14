// /src/lib/alert_add/resigner_shift_check.ts
// user_entry_united_view_single で「removed_from_lineworks_kaipoke」な人を拾い、
// その人が今後の shift に残っていたら alert を出す。

import { supabaseAdmin } from '@/lib/supabase/service';
import { ensureSystemAlert } from '@/lib/alert/ensureSystemAlert';

type UserRow = {
  user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  status: string | null;
};

type ShiftRow = {
  shift_id: number;
  shift_start_date: string; // 'YYYY-MM-DD'
  kaipoke_cs_id: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
};

export type ResignerShiftResult = {
  scanned: number; // 「退職者で、なおかつシフトが残っている人」の人数
  created: number; // 新規アラート件数
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function runResignerShiftCheck(): Promise<ResignerShiftResult> {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = ymd(jst);
  const MIN_DATE = '2025-10-01';

  // 1) 退職者リスト
  const { data: users, error: userErr } = await supabaseAdmin
    .from('user_entry_united_view_single')
    .select('user_id, last_name_kanji, first_name_kanji, status')
    .eq('status', 'removed_from_lineworks_kaipoke');

  if (userErr) {
    console.error('[resigner_shift] users select error', userErr);
    throw new Error(`user_entry_united_view_single select failed: ${userErr.message}`);
  }

  const userRows = (users ?? []) as UserRow[];
  if (!userRows.length) {
    console.log('[resigner_shift] no removed users');
    return { scanned: 0, created: 0 };
  }

  const userIds = userRows.map((u) => u.user_id);
  // Supabase の .or(...in...) 用に "(a,b,c)" 形式の文字列を作る
  const inList = userIds.map((id) => `"${id}"`).join(',');

  // 2) 今後の日付で、退職者が staff_01/02/03 に含まれている shift を探す
  const { data: shifts, error: shiftErr } = await supabaseAdmin
    .from('shift')
    .select(
      'shift_id, shift_start_date, kaipoke_cs_id, staff_01_user_id, staff_02_user_id, staff_03_user_id',
    )
    .gte('shift_start_date', MIN_DATE)
    .gte('shift_start_date', today)
    .not('kaipoke_cs_id', 'like', '99999999%')
    .or(
      [
        `staff_01_user_id.in.(${inList})`,
        `staff_02_user_id.in.(${inList})`,
        `staff_03_user_id.in.(${inList})`,
      ].join(','),
    );

  if (shiftErr) {
    console.error('[resigner_shift] shift select error', shiftErr);
    throw new Error(`shift select failed: ${shiftErr.message}`);
  }

  const shiftRows = (shifts ?? []) as ShiftRow[];
  if (!shiftRows.length) {
    console.log('[resigner_shift] no future shifts with removed users');
    return { scanned: 0, created: 0 };
  }

  // 3) ユーザーごとに、関係するシフトをまとめる
  const byUser = new Map<string, ShiftRow[]>();

  for (const s of shiftRows) {
    for (const uid of [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id]) {
      if (!uid) continue;
      if (!userIds.includes(uid)) continue;
      const arr = byUser.get(uid) ?? [];
      arr.push(s);
      byUser.set(uid, arr);
    }
  }

  let created = 0;
  let scanned = 0;

  const firstOfMonth = ymd(new Date(jst.getFullYear(), jst.getMonth(), 1));

  for (const u of userRows) {
    const shiftsForUser = byUser.get(u.user_id) ?? [];
    if (!shiftsForUser.length) continue;

    scanned++;

    const fullName = `${u.last_name_kanji ?? ''} ${u.first_name_kanji ?? ''}`.trim() || u.user_id;
    const count = shiftsForUser.length;
    const firstShift = shiftsForUser.reduce((a, b) =>
      a.shift_start_date <= b.shift_start_date ? a : b,
    );

    const link = `https://myfamille.shi-on.net/portal/shift-view?user_id=${encodeURIComponent(
      u.user_id,
    )}&date=${firstOfMonth}&per=50&page=1`;

    const message =
      `【要修正】カイポケ削除済みスタッフがシフトに残っています：${fullName}（user_id: ${u.user_id}）` +
      `　シフト件数: ${count} 件 / 最初の日付: ${firstShift.shift_start_date}` +
      `<a href="${link}" target="_blank" rel="noreferrer">シフト一覧</a>`;

    try {
      const res = await ensureSystemAlert({
        message,
        visible_roles: ['manager', 'staff'],
        // 利用者単位ではないので cs_id は特に紐付けない
        kaipoke_cs_id: null,
        user_id: u.user_id,
      });
      if (res.created) created++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[resigner_shift] ensureSystemAlert error', {
        user_id: u.user_id,
        msg,
      });
    }
  }

  console.log('[resigner_shift] done', { scanned, created });

  return { scanned, created };
}
