// src/lib/roster/rosterDailyRepo.ts
"use client";

import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";
import { supabaseAdmin as SB } from "@/lib/supabase/service";

const SHIFT_VIEW = "shift_csinfo_postalname_view";
const STAFF_VIEW = "staff_roster_view";

type RawShiftRow = {
  shift_id: number;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  client_name: string | null;
  service_code: string | null;
  service_name: string | null;
  staff_user01_id: string | null;
  staff_user02_id: string | null;
  staff_user03_id: string | null;
};

type RawStaffRow = {
  id: string;
  name: string;
  team: string | null;
  level: string | null;
  status: "ACTIVE" | "RETIRED";
};

const toHHmm = (t: string) => {
  const [h = "00", m = "00"] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
};

function explodeCards(r: RawShiftRow): RosterShiftCard[] {
  const base = {
    start_at: toHHmm(r.shift_start_time),
    end_at: toHHmm(r.shift_end_time),
    client_name: r.client_name ?? "",
    service_code: r.service_code ?? "",
    service_name: r.service_name ?? "",
  };
  const id = String(r.shift_id);
  const out: RosterShiftCard[] = [];
  if (r.staff_user01_id) out.push({ id: `${id}_${r.staff_user01_id}`, staff_id: r.staff_user01_id, ...base });
  if (r.staff_user02_id) out.push({ id: `${id}_${r.staff_user02_id}`, staff_id: r.staff_user02_id, ...base });
  if (r.staff_user03_id) out.push({ id: `${id}_${r.staff_user03_id}`, staff_id: r.staff_user03_id, ...base });
  return out;
}

function sortStaff(a: RosterStaff, b: RosterStaff): number {
  const ta = a.team ?? "", tb = b.team ?? "";
  if (ta !== tb) return ta.localeCompare(tb, "ja");
  const la = a.level ?? "", lb = b.level ?? "";
  if (la !== lb) return la.localeCompare(lb, "ja", { numeric: true });
  return a.name.localeCompare(b.name, "ja");
}

export async function getDailyShiftView(date: string): Promise<RosterDailyView> {
  // 1) シフト（View）
  const { data: shiftRowsRaw, error: shiftErr } = await SB
    .from(SHIFT_VIEW)
    .select(
      "shift_id,shift_start_date,shift_start_time,shift_end_time,client_name,service_code,service_name,staff_user01_id,staff_user02_id,staff_user03_id"
    )
    .eq("shift_start_date", date);

  if (shiftErr) {
    console.error("[rosterDailyRepo] Shift view error:", shiftErr);
  }
  const shiftRows = (shiftRowsRaw ?? []) as unknown as RawShiftRow[];
  const cards: RosterShiftCard[] = shiftRows.flatMap(explodeCards);

  // 2) スタッフ（View）
  const { data: staffRowsRaw, error: staffErr } = await SB
    .from(STAFF_VIEW)
    .select("id,name,team,level,status")
    .in("status", ["ACTIVE", "RETIRED"]);

  if (staffErr) {
    console.error("[rosterDailyRepo] Staff view error:", staffErr);
  }
  const staffRows = (staffRowsRaw ?? []) as unknown as RawStaffRow[];
  const staff: RosterStaff[] = staffRows.map(r => ({
    id: r.id,
    name: r.name,
    team: r.team,
    level: r.level,
    status: r.status,
  }));

  staff.sort(sortStaff);
  return { date, staff, shifts: cards };
}

// 互換名
export const getRosterDailyView = getDailyShiftView;
