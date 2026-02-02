// src/lib/shift/shift-staff-check.ts
// 「直近N日シフトが無い（入社日 or 最後のシフトからN日以上）」スタッフが、これからのシフトに入っていたら
// 人事労務サポート（固定チャンネル）へ通知する

import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

const FIXED_CHANNEL_ID = "99142491";
const JST_OFFSET = "+09:00";

type RosterRow = {
  shift_id: number;
  shift_date: string; // YYYY-MM-DD
  start_at: string; // HH:mm:ss or HH:mm (text)
  end_at?: string | null;
  staff_id_1?: string | null;
  staff_id_2?: string | null;
  staff_id_3?: string | null;
  client_name?: string | null;
  kaipoke_cs_id?: string | null;
};

type UserRow = {
  user_id: string;
  lw_userid?: string | null;
  last_name_kanji?: string | null;
  first_name_kanji?: string | null;
  entry_date_original?: string | null; // YYYY-MM-DD
  entry_date_latest?: string | null; // YYYY-MM-DD
  status?: string | null;
};

export type ShiftStaffCheckResult = {
  ok: boolean;
  alerts: number;
  checkedShifts: number;
  sent: boolean;
  params: {
    dryRun: boolean;
    daysAhead: number;
    inactiveDays: number;
  };
  errors?: Array<{ message: string; code?: string; details?: string; hint?: string }>;
};

function toIsoDateJst(d: Date) {
  // YYYY-MM-DD (JST)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function addDaysIsoDate(isoDate: string, days: number) {
  const base = new Date(`${isoDate}T00:00:00${JST_OFFSET}`);
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return toIsoDateJst(next);
}

function parseShiftStartMs(shiftDate: string, startAt: string | null | undefined) {
  const hhmm = (startAt ?? "00:00").split(":").slice(0, 2).join(":");
  const iso = `${shiftDate}T${hhmm}:00${JST_OFFSET}`;
  return new Date(iso).getTime();
}

function parseEntryMs(entryDate: string) {
  return new Date(`${entryDate}T00:00:00${JST_OFFSET}`).getTime();
}

function staffName(u?: UserRow | null) {
  const ln = (u?.last_name_kanji ?? "").trim();
  const fn = (u?.first_name_kanji ?? "").trim();
  const full = `${ln}${fn}`.trim();
  return full || u?.user_id || "（不明）";
}

// 既存コードと同様、mentionは <m userId="xxx">さん 形式に寄せる
function staffMention(u?: UserRow | null) {
  const lw = (u?.lw_userid ?? "").trim();
  if (!lw) return staffName(u);
  return `<m userId="${lw}">さん`;
}

function findPrevMs(sorted: number[], target: number) {
  // target より「小さい」最大値
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans >= 0 ? sorted[ans] : null;
}

export async function runShiftStaffCheck(opts: {
  now?: Date;
  dryRun?: boolean;
  daysAhead?: number;
  inactiveDays?: number;
} = {}): Promise<ShiftStaffCheckResult> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const daysAhead = Number.isFinite(opts.daysAhead) ? (opts.daysAhead as number) : 21;
  const inactiveDays = Number.isFinite(opts.inactiveDays) ? (opts.inactiveDays as number) : 15;

  const result: ShiftStaffCheckResult = {
    ok: true,
    alerts: 0,
    checkedShifts: 0,
    sent: false,
    params: { dryRun, daysAhead, inactiveDays },
  };

  try {
    const today = toIsoDateJst(now);
    const endDate = addDaysIsoDate(today, daysAhead);

    // 1) これからのシフト（対象期間）
    const { data: upcomingRaw, error: upcomingErr } = await supabaseAdmin
      .from("shift_csinfo_roster_view")
      .select("shift_id, shift_date, start_at, staff_id_1, staff_id_2, staff_id_3, client_name, kaipoke_cs_id")
      .gte("shift_date", today)
      .lte("shift_date", endDate)
      .order("shift_date", { ascending: true })
      .order("start_at", { ascending: true });

    if (upcomingErr) throw upcomingErr;

    const upcoming = (upcomingRaw as RosterRow[]) ?? [];
    result.checkedShifts = upcoming.length;

    if (upcoming.length === 0) return result;

    // 2) 対象スタッフID抽出
    const staffIds = new Set<string>();
    for (const r of upcoming) {
      for (const sid of [r.staff_id_1, r.staff_id_2, r.staff_id_3]) {
        const s = (sid ?? "").trim();
        if (s) staffIds.add(s);
      }
    }
    const staffIdList = Array.from(staffIds);
    if (staffIdList.length === 0) return result;

    // 3) スタッフ情報（入社日・lw_userid・氏名）
    const { data: usersRaw, error: usersErr } = await supabaseAdmin
      .from("user_entry_united_view_single")
      .select("user_id, lw_userid, last_name_kanji, first_name_kanji, entry_date_original, entry_date_latest, status")
      .in("user_id", staffIdList)
      .neq("status", "removed_from_lineworks_kaipoke")
      .neq("status", "inactive");

    if (usersErr) throw usersErr;

    const users = (usersRaw as UserRow[]) ?? [];
    const userMap = new Map<string, UserRow>();
    for (const u of users) userMap.set(u.user_id, u);

    // 4) 対象スタッフの「過去～未来」シフト（直近判定に使う）
    //    直近15日判定だが、シンプルに少し広めに取る（90日前～daysAhead先）
    const historyStart = addDaysIsoDate(today, -90);

    // staff_id_1/2/3 それぞれ in をかけて集める（or文字列組み立て事故を避ける）
    const [h1, h2, h3] = await Promise.all([
      supabaseAdmin
        .from("shift_csinfo_roster_view")
        .select("shift_id, shift_date, start_at, staff_id_1, staff_id_2, staff_id_3")
        .gte("shift_date", historyStart)
        .lte("shift_date", endDate)
        .in("staff_id_1", staffIdList),
      supabaseAdmin
        .from("shift_csinfo_roster_view")
        .select("shift_id, shift_date, start_at, staff_id_1, staff_id_2, staff_id_3")
        .gte("shift_date", historyStart)
        .lte("shift_date", endDate)
        .in("staff_id_2", staffIdList),
      supabaseAdmin
        .from("shift_csinfo_roster_view")
        .select("shift_id, shift_date, start_at, staff_id_1, staff_id_2, staff_id_3")
        .gte("shift_date", historyStart)
        .lte("shift_date", endDate)
        .in("staff_id_3", staffIdList),
    ]);

    if (h1.error) throw h1.error;
    if (h2.error) throw h2.error;
    if (h3.error) throw h3.error;

    const historyAll = ([] as RosterRow[])
      .concat((h1.data as RosterRow[]) ?? [])
      .concat((h2.data as RosterRow[]) ?? [])
      .concat((h3.data as RosterRow[]) ?? []);

    // staffごとの shiftStartMs の配列を作る
    const staffShiftMs = new Map<string, number[]>();
    for (const sid of staffIdList) staffShiftMs.set(sid, []);

    for (const r of historyAll) {
      const ms = parseShiftStartMs(r.shift_date, r.start_at);
      for (const sid of [r.staff_id_1, r.staff_id_2, r.staff_id_3]) {
        const s = (sid ?? "").trim();
        if (!s) continue;
        if (!staffShiftMs.has(s)) continue;
        staffShiftMs.get(s)!.push(ms);
      }
    }

    // sort + uniq（同じシフトが3回入ってもOKなように）
    for (const [sid, arr] of staffShiftMs.entries()) {
      arr.sort((a, b) => a - b);
      const uniq: number[] = [];
      for (const v of arr) {
        if (uniq.length === 0 || uniq[uniq.length - 1] !== v) uniq.push(v);
      }
      staffShiftMs.set(sid, uniq);
    }

    // 5) 判定してアラート作成
    const thresholdMs = inactiveDays * 24 * 60 * 60 * 1000;

    const alertLines: string[] = [];
    const dedupe = new Set<string>();

    for (const r of upcoming) {
      const shiftMs = parseShiftStartMs(r.shift_date, r.start_at);
      const hhmm = (r.start_at ?? "").split(":").slice(0, 2).join(":");
      const dateDisp = r.shift_date.replaceAll("-", "/");
      const clientName = (r.client_name ?? "").trim() || "（利用者名不明）";

      const staffCols = [r.staff_id_1, r.staff_id_2, r.staff_id_3];
      for (const sidRaw of staffCols) {
        const sid = (sidRaw ?? "").trim();
        if (!sid) continue;

        const key = `${r.shift_id}:${sid}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);

        const u = userMap.get(sid) ?? null;

        // 入社日（original優先、無ければlatest）
        const entryDate = (u?.entry_date_original ?? u?.entry_date_latest ?? "").trim();
        const entryMs = entryDate ? parseEntryMs(entryDate) : null;

        const shifts = staffShiftMs.get(sid) ?? [];
        const prevMs = findPrevMs(shifts, shiftMs);
        const refMs = prevMs ?? entryMs;

        // 参照日が取れないなら判定できないのでスキップ
        if (!refMs) continue;

        if (shiftMs - refMs >= thresholdMs) {
          const who = staffMention(u);

          alertLines.push(
            `・${dateDisp} ${hhmm}　${clientName} のシフトに ${who} が入っていますが、直近${inactiveDays}日はシフト勤務がありません。正しいシフトか確認をしてください。`
          );
        }
      }
    }

    result.alerts = alertLines.length;

    // 6) 送信
    if (alertLines.length === 0) {
      return result; // 何も無ければ送らない
    }

    const header = `【シフト担当者チェック】\n対象: ${today}〜${endDate}\n条件: 直近${inactiveDays}日シフトなし（入社日 or 最後のシフトから）\n\n`;
    const maxLines = 80;
    const body =
      alertLines.length <= maxLines
        ? alertLines.join("\n")
        : alertLines.slice(0, maxLines).join("\n") + `\n…他${alertLines.length - maxLines}件`;

    const message = header + body;

    if (dryRun) {
      console.log("[DRY_RUN] send skipped. channelId=", FIXED_CHANNEL_ID);
      console.log(message);
      result.sent = false;
      return result;
    }

    const accessToken = await getAccessToken();
    await sendLWBotMessage(FIXED_CHANNEL_ID, message, accessToken);
    result.sent = true;

    return result;
  } catch (e: any) {
    result.ok = false;
    result.errors = [
      {
        message: String(e?.message ?? e),
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
      },
    ];
    return result;
  }
}
