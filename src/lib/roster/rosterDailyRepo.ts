// src/lib/roster/rosterDailyRepo.ts
// any を使わない型安全版。Supabase クライアントで取得し、unknown 経由で絞り込み。

import { supabaseAdmin as SB } from "@/lib/supabase/service";
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";

// ==== DB Row Types (strict) ====
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
}

// ==== utils ====
const makeFullName = (last: string | null | undefined, first: string | null | undefined): string => `${last ?? ""}${first ?? ""}`;

// ==== main ====
export async function getDailyRosterView(date: string): Promise<RosterDailyView> {
  // -- 1) staff
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

  if (staffErr) {
    // ログのみ（UIは継続）
    console.warn("[roster] staff query error", staffErr);
  }

  const staffRows: StaffRow[] = (staffRaw ?? []) as unknown as StaffRow[];

  const staff: RosterStaff[] = staffRows.map((r): RosterStaff => ({
    id: String(r.user_id),
    name: makeFullName(r.last_name_kanji, r.first_name_kanji),
    team: r.orgunitname ?? null,
    team_order: typeof r.org_order_num === "number" ? r.org_order_num : Number.MAX_SAFE_INTEGER,
    level_order: typeof r.level_sort === "number" ? r.level_sort : Number.MAX_SAFE_INTEGER,
  }));

  if (staff.length === 0) {
    console.warn("[roster] no staff records");
  }

  // -- 2) shifts (prefer: shift_csinfo_roster_view)
  const shiftSel = [
    "shift_id",
    "shift_date",
    "start_at",
    "end_at",
    "staff_id_1",
    "staff_id_2",
    "staff_id_3",
    "client_name",
    "service_name",
    "service_code",
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

  // -- 2') fallback: shift_csinfo_postalname_view
  if (!shiftRows) {
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
      }));
    }
  }

  // -- 3) map to cards
  const makeCard = (
    sid: number,
    uid: string | number | null,
    s: string,
    e: string,
    cn: string | null,
    sn: string | null,
    sc: string | null,
  ): RosterShiftCard => ({
    id: `${sid}_${uid ?? ""}`,
    staff_id: String(uid),
    start_at: s,
    end_at: e,
    client_name: cn ?? "",
    service_name: sn ?? "",
    service_code: sc ?? "",
  });

  const shifts: RosterShiftCard[] = [];
  for (const r of shiftRows ?? []) {
    if (r.staff_id_1) shifts.push(makeCard(r.shift_id, r.staff_id_1, r.start_at, r.end_at, r.client_name, r.service_name, r.service_code));
    if (r.staff_id_2) shifts.push(makeCard(r.shift_id, r.staff_id_2, r.start_at, r.end_at, r.client_name, r.service_name, r.service_code));
    if (r.staff_id_3) shifts.push(makeCard(r.shift_id, r.staff_id_3, r.start_at, r.end_at, r.client_name, r.service_name, r.service_code));
  }

  if (shifts.length === 0) {
    console.warn("[roster] no shifts for", date);
  }

  return { date, staff, shifts };
}
