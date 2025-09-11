// src/lib/roster/rosterDailyRepo.ts
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";
import { supabaseAdmin as SB } from "@/lib/supabase/service";


// .env で上書き可。既定はご提供の CSV/ビュー名に寄せる
const SHIFT_VIEW =  "shift_csinfo_postalname_view";
const STAFF_VIEW =  "user_entry_united_view_single";


// 文字列化
const toStr = (v: unknown) => (v == null ? "" : String(v));
// HH:mm 正規化
const toHHmm = (v: unknown) => {
const s = toStr(v);
// 例: "09:00:00" → "09:00"
if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.slice(0, 5);
return s;
};


export async function getDailyRosterView(date: string): Promise<RosterDailyView> {
// --- Staff ---
// カラム名は環境差があるため `select('*')` で取得 → コード側で吸収
const { data: srows, error: sErr } = await SB.from(STAFF_VIEW).select("*");
if (sErr) throw sErr;


const staff: RosterStaff[] = (srows ?? []).map((r: any) => {
const id = toStr(r.user_id ?? r.staff_user_id ?? r.id); // どれかに合わせる
const name = `${toStr(r.last_name_kanji ?? r.last_name ?? "")} ${
toStr(r.first_name_kanji ?? r.first_name ?? "")
}`.trim();


// org 表示名 & 並び順候補
const team = (r.orgunitname ?? r.group_name ?? r.org_name ?? null) as string | null;
const team_order = (r.org_sort ?? r.org_order ?? r.orgunit_sort ?? null) as number | null;


// level 表示名 & 並び順候補
const level = (r.level ?? r.level_name ?? r.level_code ?? null) as string | null;
const level_order = (r.level_sort ?? r.level_order ?? null) as number | null;


const status = (r.status ?? "ACTIVE") as string;


return { id, name, team, team_order, level, level_order, status };
});


// --- Shifts ---
const tryShiftFetch = async () => {
// 環境差に対応: 候補カラムで順に試す
const candidates = ["shift_start_date", "visit_date", "date"] as const;
let lastErr: unknown = null;
for (const col of candidates) {
const { data, error } = await SB.from(SHIFT_VIEW).select("*").eq(col as string, date);
if (!error) return data ?? [];
lastErr = error;
}
throw lastErr;
};


const rawShifts: any[] = await tryShiftFetch();


const shifts: RosterShiftCard[] = rawShifts.flatMap((r) => {
const shift_id = toStr(r.shift_id ?? r.id);
const start_at = toHHmm(r.shift_start_time ?? r.start_time ?? r.start_at);
const end_at = toHHmm(r.shift_end_time ?? r.end_time ?? r.end_at);
const client_name = toStr(r.client_name ?? r.cs_name ?? r.customer_name ?? "");
const service_code = toStr(r.service_code ?? r.service_cd ?? "");
const service_name = toStr(r.service_name ?? r.service ?? "");


// 複数担当対応（存在する ID を全部拾う）
const staffIds = [
r.staff_user01_id ?? r.user01_id ?? r.main_staff_id,
r.staff_user02_id ?? r.user02_id ?? r.sub_staff_id,
]
.filter((v) => v != null)
.map((v) => toStr(v));


// データ欠損は除外
if (!shift_id || !start_at || !end_at || staffIds.length === 0) return [];


return staffIds.map((sid) => ({
id: `${shift_id}_${sid}`,
staff_id: sid,
start_at,
end_at,
client_name,
service_code,
service_name,
}));
});


// 画面左に出すのは ACTIVE のみ
const activeStaff = staff.filter((s) => (s.status ?? "ACTIVE") === "ACTIVE");


// --- ログ（開発時のみ）：件数をざっくり確認 ---
if (process.env.NODE_ENV !== "production") {
console.log("[roster] staff:", activeStaff.length, "shifts:", shifts.length, "date:", date);
// staff / shift の ID 対応が取れているか確認
const staffIdSet = new Set(activeStaff.map((s) => s.id));
const unattached = shifts.filter((c) => !staffIdSet.has(c.staff_id)).length;
if (unattached) console.warn(`[roster] shifts not attached to staff: ${unattached}`);
}


return { date, staff: activeStaff, shifts };
}