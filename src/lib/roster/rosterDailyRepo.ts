//lib/roster/rosterDailyRepo
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";
import { supabaseAdmin as SB } from "@/lib/supabase/service";

// 固定（ENV不要）
const SHIFT_VIEW = "shift_csinfo_postalname_view";
const STAFF_VIEW = "user_entry_united_view_single";

type AnyRow = Record<string, unknown>;
const isStr = (v: unknown): v is string => typeof v === "string";

function pickStr(row: AnyRow, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = row[k];
    if (isStr(v) && v.trim() !== "") return v;
  }
  return fallback;
}
function hhmm(t: string) {
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}
function rowDateStr(row: AnyRow): string {
  // ビュー差異吸収：先頭が YYYY-MM-DD の文字列を採用
  const cands = ["shift_start_date", "date", "shift_date", "service_date", "visit_date"];
  for (const k of cands) {
    const v = row[k];
    if (isStr(v) && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return "";
}

export async function getRosterDailyView(date: string): Promise<RosterDailyView> {
  // ---- スタッフ取得 ----
  const { data: staffRows, error: staffErr } = await SB.from(STAFF_VIEW).select("*");
  if (staffErr) {
    console.error("[roster] staff select error", staffErr);
    throw staffErr;
  }
  const staff: RosterStaff[] = (staffRows as AnyRow[])
    .map((r) => {
      const id = pickStr(r, ["user_id", "id"]);
      const last = pickStr(r, ["last_name_kanji", "last_name", "sei"]);
      const first = pickStr(r, ["first_name_kanji", "first_name", "mei"]);
      const name = `${last}${first}`.trim() || pickStr(r, ["name"]);
      // orgunitname を最優先（要望）
      const team = pickStr(r, ["orgunitname", "org_name", "group_name"]) || null;
      const level = pickStr(r, ["level", "level_name", "levels"]) || null;
      return { id, name, team, level, status: "ACTIVE" as const };
    })
    .filter((s) => s.id && s.name);

  // 並び：チーム→レベル(数値)→氏名
  staff.sort((a, b) => {
    const ta = a.team ?? "", tb = b.team ?? "";
    if (ta !== tb) return ta.localeCompare(tb, "ja");
    const la = Number.isFinite(Number(a.level)) ? Number(a.level) : Number.MAX_SAFE_INTEGER;
    const lb = Number.isFinite(Number(b.level)) ? Number(b.level) : Number.MAX_SAFE_INTEGER;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name, "ja");
  });

  // ---- シフト取得（SQLでWHEREせず→JSで日付フィルタ）----
  const { data: shiftRows, error: shiftErr } = await SB.from(SHIFT_VIEW).select("*");
  if (shiftErr) {
    console.error("[roster] shift select error", shiftErr);
    throw shiftErr;
  }

  const shifts: RosterShiftCard[] = [];
  for (const r of (shiftRows as AnyRow[])) {
    if (rowDateStr(r) !== date) continue;

    const shiftId = pickStr(r, ["shift_id", "id"]);
    const start = hhmm(pickStr(r, ["shift_start_time", "start_time", "start_at"]));
    const end = hhmm(pickStr(r, ["shift_end_time", "end_time", "end_at"]));
    if (!shiftId || !start || !end) continue;

    const client =
      pickStr(r, ["client_name", "cs_fullname", "client_fullname"]) ||
      `${pickStr(r, ["cs_last_name_kanji", "client_last_name_kanji"])}${pickStr(r, ["cs_first_name_kanji", "client_first_name_kanji"])}`.trim();

    const service_code = pickStr(r, ["service_code", "servicecode"]);
    const service_name = pickStr(r, ["service_name", "servicename", "service"]);

    const staffIdKeys = [
      "staff_user01_id",
      "staff_user02_id",
      "staff_user03_id",
      "staff_user04_id",
      "staff_user05_id",
      "staff_user06_id",
      "staff_user_id",
      "user_id",
    ];
    const staffIds = staffIdKeys.map((k) => pickStr(r, [k])).filter((v) => v);

    if (staffIds.length === 0) continue;

    for (const sid of staffIds) {
      shifts.push({
        id: `${shiftId}_${sid}`,
        staff_id: sid,
        start_at: start,
        end_at: end,
        client_name: client || "",
        service_code,
        service_name,
      });
    }
  }

  return { date, staff, shifts };
}

// 旧呼び名の互換エクスポート（呼び出し側が混在していてもOK）
export const getDailyRosterView = getRosterDailyView;
