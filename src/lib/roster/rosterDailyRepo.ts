// ▼ 目的
// ・/portal/roster/daily のスタッフ並び替えを「① roster_sort → ② 氏名」にするため、
//   staff データに roster_sort を付与する。
// ・最小変更：このファイルだけ。DBや他ファイルは変更不要。
// ・やること：users から (user_id, roster_sort) を別取得して合流する。

// --- 変更前から存在する import と型はそのまま ---
import { supabaseAdmin as SB } from "@/lib/supabase/service";
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";

// ==== 追加: users.roster_sort を受ける型 ====
interface RosterSortRow { user_id: string | number; roster_sort: string | null }

// ==== 既存の型はそのまま（抜粋） ====
interface StaffRow {
  user_id: string | number;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  orgunitname: string | null;
  org_order_num: number | null;
  level_sort: number | null;
}

interface ShiftRowView {
  shift_id: number;
  shift_date: string; // YYYY-MM-DD
  start_at: string;   // HH:MM
  end_at: string;     // HH:MM
  staff_id_1: string | number | null;
  staff_id_2: string | number | null;
  staff_id_3: string | number | null;
  client_name: string | null;
  service_name: string | null;
  service_code: string | null;
  kaipoke_cs_id?: string | number;
}

interface ShiftRowFallback {
  shift_id: number;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  staff_01_user_id: string | number | null;
  staff_02_user_id: string | number | null;
  staff_03_user_id: string | number | null;
  name: string | null;                 // client_name
  kaipoke_servicecode: string | null; // service_name
  service_code: string | null;
  kaipoke_cs_id?: string | number;
}

const makeFullName = (last?: string | null, first?: string | null) => `${last ?? ""}${first ?? ""}`;

export async function getDailyRosterView(date: string): Promise<RosterDailyView> {
  // -- 1) staff（既存）
  const staffSel = [
    "user_id",
    "last_name_kanji",
    "first_name_kanji",
    "orgunitname",
    "org_order_num",
    "level_sort",
  ].join(",");

  const { data: staffRaw, error: staffErr } = await SB
    .from("user_entry_united_view_single")
    .select(staffSel);
  if (staffErr) console.warn("[roster] staff query error", staffErr);
  const staffRows: StaffRow[] = (staffRaw ?? []) as unknown as StaffRow[];

  // -- 1') ★ 最小追加：users から roster_sort を取得して合流
  const { data: sortRaw, error: sortErr } = await SB
    .from("users")
    .select("user_id,roster_sort");
  if (sortErr) console.warn("[roster] users.roster_sort query error", sortErr);
  const sortMap = new Map<string, string>();
  (sortRaw ?? []).forEach((r) => {
    const row = r as RosterSortRow;
    sortMap.set(String(row.user_id), row.roster_sort ?? "9999");
  });

  // staff へのマッピング（roster_sort を添える以外は従来どおり）
  type RosterStaffEx = RosterStaff & { roster_sort?: string };
  const staff: RosterStaffEx[] = staffRows.map((r): RosterStaffEx => ({
    id: String(r.user_id),
    name: makeFullName(r.last_name_kanji, r.first_name_kanji),
    team: r.orgunitname ?? null,
    team_order: typeof r.org_order_num === "number" ? r.org_order_num : Number.MAX_SAFE_INTEGER,
    level_order: typeof r.level_sort === "number" ? r.level_sort : Number.MAX_SAFE_INTEGER,
    roster_sort: sortMap.get(String(r.user_id)) ?? "9999",
  }));
  if (staff.length === 0) console.warn("[roster] no staff records");

  // -- 2) shifts：既存ロジックのまま（まず roster_view、無ければ postalname_view）
  const shiftSel = [
    "shift_id","shift_date","start_at","end_at",
    "staff_id_1","staff_id_2","staff_id_3",
    "client_name","service_name","service_code","kaipoke_cs_id",
  ].join(",");

  let shiftRows: ShiftRowView[] | null = null;
  {
    const { data, error } = await SB
      .from("shift_csinfo_roster_view")
      .select(shiftSel)
      .eq("shift_date", date);
    if (error) {
      console.warn("[roster] roster_view query error → fallback to postalname_view", error);
    } else {
      shiftRows = (data ?? []) as unknown as ShiftRowView[];
    }
  }

  if (!shiftRows) {
    const fbSel = [
      "shift_id","shift_start_date","shift_start_time","shift_end_time",
      "staff_01_user_id","staff_02_user_id","staff_03_user_id",
      "name","kaipoke_servicecode","service_code","kaipoke_cs_id",
    ].join(",");

    const { data, error } = await SB
      .from("shift_csinfo_postalname_view")
      .select(fbSel)
      .eq("shift_start_date", date);

    if (error) {
      console.warn("[roster] postalname_view query error", error);
      shiftRows = [] as ShiftRowView[];
    } else {
      const rows = (data ?? []) as unknown as ShiftRowFallback[];
      shiftRows = rows.map((r): ShiftRowView => ({
        shift_id: r.shift_id,
        shift_date: r.shift_start_date,
        start_at: r.shift_start_time,
        end_at: r.shift_end_time,
        staff_id_1: r.staff_01_user_id,
        staff_id_2: r.staff_02_user_id,
        staff_id_3: r.staff_03_user_id,
        client_name: r.name,
        service_name: r.kaipoke_servicecode,
        service_code: r.service_code,
        kaipoke_cs_id: r.kaipoke_cs_id,
      }));
    }
  }

  // -- 3) map to cards（従来どおり）
  const makeCard = (
    sid: number,
    uid: string | number | null,
    s: string,
    e: string,
    cn: string | null,
    sn: string | null,
    sc: string | null,
    kcid?: string | number,
  ): RosterShiftCard => ({
    id: `${sid}_${uid ?? ""}`,
    staff_id: String(uid),
    start_at: s,
    end_at: e,
    client_name: cn ?? "",
    service_name: sn ?? "",
    service_code: sc ?? "",
    kaipoke_cs_id: kcid ?? "",
  });

  const shifts: RosterShiftCard[] = [];
  for (const r of shiftRows ?? []) {
    if (r.staff_id_1) shifts.push(makeCard(r.shift_id, r.staff_id_1, r.start_at, r.end_at, r.client_name, r.service_name, r.service_code));
    if (r.staff_id_2) shifts.push(makeCard(r.shift_id, r.staff_id_2, r.start_at, r.end_at, r.client_name, r.service_name, r.service_code));
    if (r.staff_id_3) shifts.push(makeCard(r.shift_id, r.staff_id_3, r.start_at, r.end_at, r.client_name, r.service_name, r.service_code));
  }

  if (shifts.length === 0) console.warn("[roster] no shifts for", date);

  return { date, staff, shifts } as RosterDailyView;
}
