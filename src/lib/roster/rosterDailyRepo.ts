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
import { normalizeShiftEventAlerts } from "@/lib/shiftEventAlerts";

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
  system_role: string | null;
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

  has_roster_error?: boolean | null;
  roster_error_visit_record?: boolean | null;
  roster_error_actual_record?: boolean | null;
  roster_error_actual_record_months?: string[] | null;
  roster_error_care_consultant?: boolean | null;
  roster_error_transport_info?: boolean | null;
  roster_error_kodoengo_plan?: boolean | null;
  shift_event_alerts?: unknown;
  multiple_service_group_id?: string | null;
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

interface ShiftDetailsRow {
  shift_id: number;
  required_staff_count: number | null;
  two_person_work_flg: boolean | null;
  judo_ido: string | number | null;
  staff_02_attend_flg: boolean | null;
  staff_03_attend_flg: boolean | null;
  head_shift_id: string | null;
}

interface ClientDetailsRow {
  kaipoke_cs_id: string | number | null;
  postal_code: string | null;
  address: string | null;
  biko: string | null;
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

  has_roster_error: Boolean(
    r.has_roster_error || normalizeShiftEventAlerts(r.shift_event_alerts).length,
  ),
  roster_error_visit_record: Boolean(r.roster_error_visit_record),
  roster_error_actual_record: Boolean(r.roster_error_actual_record),
  roster_error_actual_record_months:
    r.roster_error_actual_record_months ?? [],
  roster_error_care_consultant: Boolean(r.roster_error_care_consultant),
  roster_error_transport_info: Boolean(r.roster_error_transport_info),
  roster_error_kodoengo_plan: Boolean(r.roster_error_kodoengo_plan),
  shift_event_alerts: normalizeShiftEventAlerts(r.shift_event_alerts),
  multiple_service_group_id: r.multiple_service_group_id ?? null,
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
  has_roster_error: Boolean(
    r.has_roster_error || normalizeShiftEventAlerts(r.shift_event_alerts).length,
  ),
  dialog: makeDialog(r),
  multiple_service_group_id: r.multiple_service_group_id ?? null,
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
  "system_role",

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
  system_role: r.system_role,
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
    "has_roster_error",
    "roster_error_visit_record",
    "roster_error_actual_record",
    "roster_error_actual_record_months",
    "roster_error_care_consultant",
    "roster_error_transport_info",
    "roster_error_kodoengo_plan",
    "shift_event_alerts",
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
        has_roster_error: false,
        roster_error_visit_record: false,
        roster_error_actual_record: false,
        roster_error_actual_record_months: [],
        roster_error_care_consultant: false,
        roster_error_transport_info: false,
        roster_error_kodoengo_plan: false,
        shift_event_alerts: [],
        multiple_service_group_id: null,
      }));
    }
  }

  // View の取得に失敗した場合でも、住所・備考は利用者情報から補完する。
  // 旧 fallback view にはこれらの列がなく、null のままだとダイアログから
  // 以前表示できていた情報が消えてしまうため、表示用データを別途復元する。
  const clientIds = Array.from(
    new Set(
      (shiftRows ?? [])
        .map((row) => row.kaipoke_cs_id)
        .filter((id): id is string | number => id != null),
    ),
  );

  if (clientIds.length > 0) {
    const { data: clientDetailsRaw, error: clientDetailsErr } = await SB
      .from("cs_kaipoke_info")
      .select("kaipoke_cs_id,postal_code,address,biko")
      .in("kaipoke_cs_id", clientIds);

    if (clientDetailsErr) {
      console.warn("[roster] client address/note query error", clientDetailsErr);
    } else {
      const clientDetails = new Map<string, ClientDetailsRow>();
      for (const raw of clientDetailsRaw ?? []) {
        const row = raw as unknown as ClientDetailsRow;
        if (row.kaipoke_cs_id != null) {
          clientDetails.set(String(row.kaipoke_cs_id), row);
        }
      }

      shiftRows = (shiftRows ?? []).map((row) => {
        const details = clientDetails.get(String(row.kaipoke_cs_id ?? ""));
        if (!details) return row;

        const address = row.address || details.address || null;
        return {
          ...row,
          postal_code: row.postal_code ?? details.postal_code ?? null,
          address,
          cs_note: row.cs_note || details.biko || null,
          map_url:
            row.map_url ??
            (address
              ? `https://www.google.com/maps/search/${address}`
              : details.postal_code
                ? `https://www.google.com/maps/search/${details.postal_code}`
                : null),
        };
      });
    }
  }

  // 旧 fallback view にはシフト側の編集項目が含まれないため、
  // 重度移動（judo_ido）などを shift テーブルから補完する。
  // shift_daily_dialog_view が利用できる場合も、欠落した値だけを補完して
  // ビュー由来の最新表示を優先する。
  const shiftIds = Array.from(
    new Set((shiftRows ?? []).map((row) => row.shift_id).filter((id) => Number.isFinite(id))),
  );

  if (shiftIds.length > 0) {
    const { data: shiftDetailsRaw, error: shiftDetailsErr } = await SB
      .from("shift")
      .select(
        "shift_id,required_staff_count,two_person_work_flg,judo_ido,staff_02_attend_flg,staff_03_attend_flg,head_shift_id",
      )
      .in("shift_id", shiftIds);

    if (shiftDetailsErr) {
      console.warn("[roster] shift detail enrichment query error", shiftDetailsErr);
    } else {
      const shiftDetails = new Map<number, ShiftDetailsRow>();
      for (const raw of shiftDetailsRaw ?? []) {
        const row = raw as unknown as ShiftDetailsRow;
        shiftDetails.set(row.shift_id, row);
      }

      shiftRows = (shiftRows ?? []).map((row) => {
        const details = shiftDetails.get(row.shift_id);
        if (!details) return row;

        return {
          ...row,
          required_staff_count: row.required_staff_count ?? details.required_staff_count,
          two_person_work_flg: row.two_person_work_flg ?? details.two_person_work_flg,
          judo_ido:
            row.judo_ido != null && String(row.judo_ido).trim() !== ""
              ? row.judo_ido
              : details.judo_ido != null
                ? String(details.judo_ido)
                : null,
          staff_02_attend_flg: row.staff_02_attend_flg ?? details.staff_02_attend_flg,
          staff_03_attend_flg: row.staff_03_attend_flg ?? details.staff_03_attend_flg,
          // multiple_service_group_id は段階導入中のView列に依存させない。
          // shift.head_shift_id が同じ識別子の正本なので、ここで補完する。
          multiple_service_group_id:
            row.multiple_service_group_id ?? details.head_shift_id ?? null,
        };
      });
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
