// src/lib/roster/rosterDailyRepo.ts
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";
import { supabaseAdmin as SB } from "@/lib/supabase/service";

const SHIFT_VIEW = process.env.ROSTER_SHIFT_VIEW ?? "shift_csinfo_postalname_view";
const STAFF_VIEW = process.env.ROSTER_STAFF_VIEW ?? "staff_roster_view";

// Supabaseの行型
type RawShiftRow = {
  shift_id: number;
  shift_start_date: string;
  shift_start_time: string; // HH:mm or HH:mm:ss
  shift_end_time: string;   // HH:mm or HH:mm:ss
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

/** 日別のボード表示データ（SSR） */
export async function getDailyShiftView(date: string): Promise<RosterDailyView> {
  // ※ SB.from のジェネリクス指定は外す（型定義の個数差異でエラーになるため）
  const { data: shiftRowsRaw, error: shiftErr } = await SB
    .from(SHIFT_VIEW)
    .select("shift_id,shift_start_date,shift_start_time,shift_end_time,client_name,service_code,service_name,staff_user01_id,staff_user02_id,staff_user03_id")
    .eq("shift_start_date", date);

  if (shiftErr) throw shiftErr;
  const shiftRows = (shiftRowsRaw ?? []) as unknown as RawShiftRow[];
  const cards: RosterShiftCard[] = shiftRows.flatMap(explodeCards);

  const { data: staffRowsRaw, error: staffErr } = await SB
    .from(STAFF_VIEW)
    .select("id,name,team,level,status")
    .in("status", ["ACTIVE", "RETIRED"]);

  if (staffErr) throw staffErr;
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

// 互換エクスポート（既存コードが getRosterDailyView を参照していても動くように）
export const getRosterDailyView = getDailyShiftView;
