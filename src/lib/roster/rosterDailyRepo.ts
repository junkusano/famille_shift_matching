import { supabaseAdmin as SB } from "@/lib/supabase/service";
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";

// ※ 環境変数は使わずに固定
const SHIFT_VIEW = "shift_csinfo_postalname_view";
const STAFF_VIEW = "user_entry_united_view_single";

/** ---------- DB行の型（緩め） ---------- */
type ShiftRow = {
  id?: number;
  shift_id?: number;
  // 日付・時刻
  shift_start_date?: string | null; // YYYY-MM-DD
  date?: string | null;             // 代替で日付列がこれのケース
  shift_start_time?: string | null; // HH:mm or HHmm
  shift_end_time?: string | null;   // HH:mm or HHmm

  // スタッフ複数担当
  staff_user_id?: string | null;
  staff_user02_id?: string | null;
  staff_user03_id?: string | null;

  // 表示用
  client_name?: string | null;
  service_code?: string | null;
  service_name?: string | null;
};

type StaffRow = {
  user_id?: string | null; // これがあれば最優先
  id?: string | null;      // または id
  auth_uid?: string | null;

  last_name_kanji?: string | null;
  first_name_kanji?: string | null;
  last_name?: string | null;
  first_name?: string | null;

  orgunitname?: string | null; // ← チーム名はこれを優先
  group_name?: string | null;  // （互換のためのフォールバック）

  level?: string | number | null;
  level_order?: number | null;
  team_order?: number | null;

  status?: "ACTIVE" | "RETIRED" | string | null;
};

/** ---------- ユーティリティ ---------- */
const hhmm = (v?: string | null): string => {
  if (!v) return "00:00";
  // "9:5" / "09:05" / "0905" に広く対応
  const m1 = v.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m1) {
    const h = m1[1].padStart(2, "0");
    const m = m1[2].padStart(2, "0");
    return `${h}:${m}`;
  }
  const m2 = v.match(/^(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}:${m2[2]}`;
  return "00:00";
};

const toStaff = (rows: StaffRow[]): RosterStaff[] => {
  return rows.map((r) => {
    const id = String(r.user_id ?? r.id ?? r.auth_uid ?? "");
    const ln = r.last_name_kanji ?? r.last_name ?? "";
    const fn = r.first_name_kanji ?? r.first_name ?? "";
    const name = `${ln} ${fn}`.trim();
    const team = r.orgunitname ?? r.group_name ?? null;
    const level =
      r.level != null
        ? String(r.level)
        : r.level_order != null
        ? String(r.level_order)
        : null;
    const status =
      r.status === "ACTIVE" || r.status === "RETIRED" ? r.status : "ACTIVE";

    return { id, name, team, level, status };
  });
};

const toCards = (date: string, rows: ShiftRow[]): RosterShiftCard[] => {
  const list: RosterShiftCard[] = [];

  for (const r of rows) {
    const shiftId = (r.shift_id ?? r.id ?? 0) as number;
    if (!shiftId) continue;

    // ビューに他日が混ざっている場合はここで日付で足切り
    const rowDate = r.shift_start_date ?? r.date;
    if (rowDate && rowDate !== date) continue;

    const start_at = hhmm(r.shift_start_time);
    const end_at = hhmm(r.shift_end_time);
    const client_name = r.client_name ?? "";
    const service_code = r.service_code ?? "";
    const service_name = r.service_name ?? "";

    const staffIds = [r.staff_user_id, r.staff_user02_id, r.staff_user03_id].filter(
      (x): x is string => !!x
    );
    if (staffIds.length === 0) continue;

    for (const sid of staffIds) {
      list.push({
        id: `${shiftId}_${sid}`,
        staff_id: sid,
        start_at,
        end_at,
        client_name,
        service_code,
        service_name,
      });
    }
  }

  return list;
};

/** ---------- 取得本体（SSR用） ---------- */
export async function getRosterDailyView(date: string): Promise<RosterDailyView> {
  // スタッフ
  const staffRes = await SB
    .from(STAFF_VIEW)
    .select(
      [
        "user_id",
        "id",
        "auth_uid",
        "last_name_kanji",
        "first_name_kanji",
        "last_name",
        "first_name",
        "orgunitname",
        "group_name",
        "level",
        "level_order",
        "team_order",
        "status",
      ].join(",")
    );
  if (staffRes.error) throw staffRes.error;
  const staff = toStaff((staffRes.data ?? []) as StaffRow[]);

  // シフト（第一候補：shift_start_date）
  const baseSelect = [
    "id",
    "shift_id",
    "shift_start_date",
    "shift_start_time",
    "shift_end_time",
    "date",
    "staff_user_id",
    "staff_user02_id",
    "staff_user03_id",
    "client_name",
    "service_code",
    "service_name",
  ].join(",");

  let shiftRows: ShiftRow[] = [];
  const try1 = await SB.from(SHIFT_VIEW).select(baseSelect).eq("shift_start_date", date);
  if (!try1.error) {
    shiftRows = (try1.data ?? []) as ShiftRow[];
  } else {
    // フォールバック：date カラムで取得
    const try2 = await SB.from(SHIFT_VIEW).select(baseSelect).eq("date", date);
    if (try2.error) throw try2.error;
    shiftRows = (try2.data ?? []) as ShiftRow[];
  }

  const shifts = toCards(date, shiftRows);

  return { date, staff, shifts };
}

export async function getDailyRosterView(date: string) {
  return getRosterDailyView(date);
}