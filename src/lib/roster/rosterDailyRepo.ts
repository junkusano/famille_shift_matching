// src/lib/roster/rosterDailyRepo.ts
// /portal/roster/daily 用
// 方針:
// - staff は従来どおり user_entry_united_view_single + users.roster_sort を合流
// - shifts は新設した shift_daily_dialog_view から取得
// - クリック時追加APIは使わず、dialog に必要なデータを初回ロードで持たせる
// - fallback は既存 shift_csinfo_postalname_view を維持

import { supabaseAdmin as SB } from "@/lib/supabase/service";
import type {
  RosterDailyView,
  RosterShiftCard,
  RosterShiftDialogData,
  RosterStaff,
} from "@/types/roster";

interface RosterSortRow {
  user_id: string | number;
  roster_sort: string | null;
}

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
  shift_date: string;
  start_at: string;
  end_at: string;

  staff_id_1: string | number | null;
  staff_id_2: string | number | null;
  staff_id_3: string | number | null;
  staff_02_attend_flg?: boolean | null;
  staff_03_attend_flg?: boolean | null;

  client_name: string | null;
  service_name: string | null;
  service_code: string | null;
  kaipoke_cs_id?: string | number;

  postal_code?: string | null;
  dsp_short?: string | null;
  address?: string | null;
  cs_note?: string | null;
  map_url?: string | null;

  gender_request?: string | null;
  gender_request_name?: string | null;
  male_flg?: boolean | null;
  female_flg?: boolean | null;

  required_staff_count?: number | null;
  two_person_work_flg?: boolean | null;
  judo_ido?: string | null;
}

interface ShiftRowFallback {
  shift_id: number;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;

  staff_01_user_id: string | number | null;
  staff_02_user_id: string | number | null;
  staff_03_user_id: string | number | null;

  name: string | null;
  kaipoke_servicecode: string | null;
  service_code: string | null;
  kaipoke_cs_id?: string | number;
  dsp_short?: string | null;

  gender_request_name?: string | null;
  male_flg?: boolean | null;
  female_flg?: boolean | null;
}

const makeFullName = (last?: string | null, first?: string | null) =>
  `${last ?? ""}${first ?? ""}`;

const toBool = (v: unknown): boolean | null => {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "t"].includes(s)) return true;
  if (["false", "0", "f"].includes(s)) return false;
  return null;
};

const makeDialog = (r: ShiftRowView): RosterShiftDialogData => ({
  shift_id: r.shift_id,
  shift_date: r.shift_date,
  start_at: r.start_at,
  end_at: r.end_at,

  kaipoke_cs_id: r.kaipoke_cs_id ?? "",
  client_name: r.client_name ?? "",

  postal_code: r.postal_code ?? null,
  dsp_short: r.dsp_short ?? null,
  address: r.address ?? null,
  cs_note: r.cs_note ?? null,
  map_url: r.map_url ?? null,

  gender_request: r.gender_request ?? null,
  gender_request_name: r.gender_request_name ?? null,
  male_flg: r.male_flg ?? null,
  female_flg: r.female_flg ?? null,

  service_code: r.service_code ?? "",
  service_name: r.service_name ?? "",

  staff_id_1: r.staff_id_1 != null ? String(r.staff_id_1) : null,
  staff_id_2: r.staff_id_2 != null ? String(r.staff_id_2) : null,
  staff_id_3: r.staff_id_3 != null ? String(r.staff_id_3) : null,
  staff_02_attend_flg: toBool(r.staff_02_attend_flg),
  staff_03_attend_flg: toBool(r.staff_03_attend_flg),

  required_staff_count:
    typeof r.required_staff_count === "number" ? r.required_staff_count : null,
  two_person_work_flg: toBool(r.two_person_work_flg),
  judo_ido: r.judo_ido ?? null,
});

const makeCard = (
  r: ShiftRowView,
  uid: string | number | null,
  staffSlot?: 1 | 2 | 3
): RosterShiftCard => ({
  id: `${r.shift_id}_${uid ?? ""}`,
  staff_id: String(uid),
  start_at: r.start_at,
  end_at: r.end_at,
  client_name: r.client_name ?? "",
  service_name: r.service_name ?? "",
  service_code: r.service_code ?? "",
  kaipoke_cs_id: r.kaipoke_cs_id ?? "",
  dsp_short: r.dsp_short ?? null,
  staff_slot: staffSlot,
  gender_request_name: r.gender_request_name ?? null,
  male_flg: r.male_flg ?? null,
  female_flg: r.female_flg ?? null,
  dialog: makeDialog(r),
});

export async function getDailyRosterView(date: string): Promise<RosterDailyView> {
  // 1) staff
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

  const { data: sortRaw, error: sortErr } = await SB
    .from("users")
    .select("user_id,roster_sort");

  if (sortErr) console.warn("[roster] users.roster_sort query error", sortErr);

  const sortMap = new Map<string, string>();
  (sortRaw ?? []).forEach((r) => {
    const row = r as RosterSortRow;
    sortMap.set(String(row.user_id), row.roster_sort ?? "9999");
  });

  const staff: RosterStaff[] = staffRows.map((r): RosterStaff => ({
    id: String(r.user_id),
    name: makeFullName(r.last_name_kanji, r.first_name_kanji),
    team: r.orgunitname ?? null,
    team_order:
      typeof r.org_order_num === "number"
        ? r.org_order_num
        : Number.MAX_SAFE_INTEGER,
    level_order:
      typeof r.level_sort === "number"
        ? r.level_sort
        : Number.MAX_SAFE_INTEGER,
    roster_sort: sortMap.get(String(r.user_id)) ?? "9999",
  }));

  if (staff.length === 0) console.warn("[roster] no staff records");

  // 2) shifts: まず新view、失敗時のみ旧view fallback
  const shiftSel = [
    "shift_id",
    "shift_date",
    "start_at",
    "end_at",
    "staff_id_1",
    "staff_id_2",
    "staff_id_3",
    "staff_02_attend_flg",
    "staff_03_attend_flg",
    "client_name",
    "service_name",
    "service_code",
    "kaipoke_cs_id",
    "postal_code",
    "dsp_short",
    "address",
    "cs_note",
    "map_url",
    "gender_request",
    "gender_request_name",
    "male_flg",
    "female_flg",
    "required_staff_count",
    "two_person_work_flg",
    "judo_ido",
  ].join(",");

  let shiftRows: ShiftRowView[] | null = null;

  {
    const { data, error } = await SB
      .from("shift_daily_dialog_view")
      .select(shiftSel)
      .eq("shift_date", date);

    if (error) {
      console.warn("[roster] shift_daily_dialog_view query error → fallback", error);
    } else {
      shiftRows = (data ?? []) as unknown as ShiftRowView[];
    }
  }

  if (shiftRows === null) {
    const fbSel = [
      "shift_id",
      "shift_start_date",
      "shift_start_time",
      "shift_end_time",
      "staff_01_user_id",
      "staff_02_user_id",
      "staff_03_user_id",
      "name",
      "kaipoke_servicecode",
      "service_code",
      "kaipoke_cs_id",
      "dsp_short",
      "gender_request_name",
      "male_flg",
      "female_flg",
    ].join(",");

    const { data, error } = await SB
      .from("shift_csinfo_postalname_view")
      .select(fbSel)
      .eq("shift_start_date", date);

    if (error) {
      console.warn("[roster] shift_csinfo_postalname_view query error", error);
      shiftRows = [];
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
        staff_02_attend_flg: null,
        staff_03_attend_flg: null,
        client_name: r.name,
        service_name: r.kaipoke_servicecode,
        service_code: r.service_code,
        kaipoke_cs_id: r.kaipoke_cs_id,
        postal_code: null,
        dsp_short: r.dsp_short ?? null,
        address: null,
        cs_note: null,
        map_url: null,
        gender_request: null,
        gender_request_name: r.gender_request_name ?? null,
        male_flg: r.male_flg ?? null,
        female_flg: r.female_flg ?? null,
        required_staff_count: null,
        two_person_work_flg: null,
        judo_ido: null,
      }));
    }
  }

  // 3) cards
  const shifts: RosterShiftCard[] = [];

  for (const r of shiftRows ?? []) {
    if (r.staff_id_1) shifts.push(makeCard(r, r.staff_id_1, 1));
    if (r.staff_id_2) shifts.push(makeCard(r, r.staff_id_2, 2));
    if (r.staff_id_3) shifts.push(makeCard(r, r.staff_id_3, 3));
  }

  if (shifts.length === 0) console.warn("[roster] no shifts for", date);

  return { date, staff, shifts };
}