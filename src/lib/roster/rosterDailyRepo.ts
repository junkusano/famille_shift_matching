// src/lib/roster/rosterDailyRepo.ts
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";
import { supabaseAdmin as SB } from "@/lib/supabase/service";

// ← 環境変数で差し替え可能にしつつ、実在名をデフォルトに
const SHIFT_VIEW = "shift_csinfo_postalname_view";
const STAFF_VIEW = "user_entry_united_view_single";

// Supabaseの行型（CSVに合わせた実在カラム）
type RawShiftRow = {
  shift_id: number;
  shift_start_date: string;
  shift_start_time: string; // HH:mm[:ss]
  shift_end_time: string;   // HH:mm[:ss]
  name: string | null;      // 利用者名
  service_code: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
};

type RawStaffRow = {
  user_id: string;
  group_name: string | null;     // チーム名
  level_sort: number | string | null; // 並び順に使う
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  // status は雇用状態ではない（auth_mail_send等）ため未使用
};

const toHHmm = (t: string) => {
  const [h = "00", m = "00"] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
};

function explodeCards(r: RawShiftRow): RosterShiftCard[] {
  const base = {
    start_at: toHHmm(r.shift_start_time),
    end_at: toHHmm(r.shift_end_time),
    client_name: r.name ?? "",
    service_code: r.service_code ?? "",
    service_name: r.service_code ?? "", // 列が無いので同値を表示
  };
  const id = String(r.shift_id);
  const out: RosterShiftCard[] = [];
  if (r.staff_01_user_id) out.push({ id: `${id}_${r.staff_01_user_id}`, staff_id: r.staff_01_user_id, ...base });
  if (r.staff_02_user_id) out.push({ id: `${id}_${r.staff_02_user_id}`, staff_id: r.staff_02_user_id, ...base });
  if (r.staff_03_user_id) out.push({ id: `${id}_${r.staff_03_user_id}`, staff_id: r.staff_03_user_id, ...base });
  return out;
}

function sortStaff(a: RosterStaff, b: RosterStaff): number {
  const ta = a.team ?? "", tb = b.team ?? "";
  if (ta !== tb) return ta.localeCompare(tb, "ja");
  // level は数値文字列前提で数値比較に倒す
  const la = Number.isFinite(Number(a.level)) ? Number(a.level) : Number.MAX_SAFE_INTEGER;
  const lb = Number.isFinite(Number(b.level)) ? Number(b.level) : Number.MAX_SAFE_INTEGER;
  if (la !== lb) return la - lb;
  return a.name.localeCompare(b.name, "ja");
}

/** 日別のボード表示データ（SSR） */
export async function getDailyShiftView(date: string): Promise<RosterDailyView> {
  // 1) シフト（View）
  const { data: shiftRowsRaw, error: shiftErr } = await SB
    .from(SHIFT_VIEW)
    .select(
      "shift_id,shift_start_date,shift_start_time,shift_end_time,name,service_code,staff_01_user_id,staff_02_user_id,staff_03_user_id"
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
    .select("user_id,group_name,level_sort,last_name_kanji,first_name_kanji");

  if (staffErr) {
    console.error("[rosterDailyRepo] Staff view error:", staffErr);
  }
  const staffRows = (staffRowsRaw ?? []) as unknown as RawStaffRow[];

  const staff: RosterStaff[] = staffRows.map(r => {
    const levelStr =
      r.level_sort == null
        ? null
        : typeof r.level_sort === "number"
        ? String(r.level_sort)
        : r.level_sort;
    const fullName = [r.last_name_kanji, r.first_name_kanji].filter(Boolean).join(" ");
    return {
      id: r.user_id,
      name: fullName || r.user_id,
      team: r.group_name,
      level: levelStr,
      status: "ACTIVE", // ← 全員をACTIVE扱いにしてUIで弾かれないようにする
    };
  });

  staff.sort(sortStaff);
  return { date, staff, shifts: cards };
}

// 互換エクスポート（旧名を参照している箇所があればそのまま動く）
export const getRosterDailyView = getDailyShiftView;
