// src/lib/roster/rosterDailyRepo.ts
import { supabaseAdmin as SB } from "@/lib/supabase/service";
import type { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";


const SHIFT_VIEW = "shift_csinfo_postalname_view";
const STAFF_VIEW = "staff_roster_view";
const ORG_TABLE = "orgs"; // orgunit master
const LEVEL_TABLE = "levels"; // level master


// ---- 型（ビュー/テーブルの列名が少し違っても動くように可変キーで受けます）
// どのキーが来ても取り出せるように optional & index シグネチャを併用


type UnknownRow = { [key: string]: unknown };


type StaffRow = UnknownRow & {
    id?: string; // staff id
    staff_id?: string; // staff id (別名)
    last_name_kanji?: string;
    first_name_kanji?: string;
    group_name?: string | null; // deprecated
    orgunitname?: string | null; // 推奨（こちらを team に使う）
    org_unit_id?: string | number | null;
    level?: string | null;
    status?: string | null;
    org_sort?: number | null; // あれば使用
    level_sort?: number | null; // あれば使用
};


type OrgRow = UnknownRow & {
    id?: string | number; // org id
    org_unit_id?: string | number; // 互換
    orgunitname?: string;
    sort?: number | null; // 並び順（列名はプロジェクト依存）
    order?: number | null;
    order_no?: number | null;
    display_order?: number | null;
};


type LevelRow = UnknownRow & {
    level?: string; // レベル名（例: "1" | "2" | ...）
    sort?: number | null; // 並び順
    order?: number | null;
    order_no?: number | null;
    display_order?: number | null;
};


type ShiftRow = UnknownRow & {
    shift_id?: number | string;
    staff_id?: string; // 主担当
    staff_user02_id?: string | null; // 複数担当（あれば複製）
    client_name?: string;
    service_code?: string;
    service_name?: string;
    // 時刻系はビュー差で名前が違うことがあるので柔軟に取得
    start_at?: string; // HH:mm（あれば優先）
    end_at?: string;
    shift_start_time?: string; // 例: "09:00"
    shift_end_time?: string; // 例: "11:30"
    shift_start_date?: string; // YYYY-MM-DD（絞り込みに使用）
    date?: string; // 互換
};


// ---- ユーティリティ
const pickStr = (row: UnknownRow, keys: string[], fallback = ""): string => {
    for (const k of keys) {
        const v = row[k];
        if (typeof v === "string" && v.length > 0) return v;
    }
    return fallback;
};


const pickNum = (row: UnknownRow, keys: string[], fallback: number | null = null): number | null => {
    for (const k of keys) {
        const v = row[k];
        if (typeof v === "number") return v;
        if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return fallback;
};


const hhmm = (s: string) => (s.length >= 5 ? s.slice(0, 5) : s);


// ---- リポジトリ本体
export async function getRosterDailyView(date: string): Promise<RosterDailyView> {
    // org / level マスタ（並び順用）
    const [{ data: orgs }, { data: levels }] = await Promise.all([
        SB.from(ORG_TABLE).select("*"),
        SB.from(LEVEL_TABLE).select("*"),
    ]);


    const orgSortById = new Map<string, number>();
    const orgSortByName = new Map<string, number>();
    (orgs ?? []).forEach((o: OrgRow, idx: number) => {
        const id = String(o.id ?? o.org_unit_id ?? idx);
        const name = pickStr(o, ["orgunitname"], "");
        const ord = pickNum(o, ["sort", "order", "order_no", "display_order"], idx) ?? idx;
        orgSortById.set(id, ord);
        if (name) orgSortByName.set(name, ord);
    });


    const levelSort = new Map<string, number>();
    (levels ?? []).forEach((lv: LevelRow, idx: number) => {
        const name = pickStr(lv, ["level"], "");
        const ord = pickNum(lv, ["sort", "order", "order_no", "display_order"], idx) ?? idx;
        if (name) levelSort.set(name, ord);
    });


    // スタッフ
    const { data: staffRaw, error: staffErr } = await SB.from(STAFF_VIEW).select("*");
    if (staffErr) throw staffErr;


    const staff: RosterStaff[] = (staffRaw as StaffRow[]).map((r, idx) => {
        const id = String(r.staff_id ?? r.id ?? idx);
        const name = `${pickStr(r, ["last_name_kanji"])}` + `${pickStr(r, ["first_name_kanji"])}`;
        const orgName = pickStr(r, ["orgunitname"], pickStr(r, ["group_name"], null as unknown as string));
        const orgId = pickStr(r as UnknownRow, ["org_unit_id"], "");
        const lv = pickStr(r, ["level"], "");
        const status = pickStr(r, ["status"], "ACTIVE") as RosterStaff["status"];


        const team_order = r.org_sort ?? pickNum({ value: orgSortById.get(orgId) }, ["value"], null) ?? (
            orgName ? pickNum({ value: orgSortByName.get(orgName) }, ["value"], null) : null
        );
        const level_order = r.level_sort ?? pickNum({ value: levelSort.get(lv) }, ["value"], null);


        return { id, name, team: orgName, level: lv || null, status, team_order: team_order ?? null, level_order: level_order ?? null };
    });


    // 指定日のシフト
    // ビューによっては列名が shift_start_date ではなく date のこともあるため、まずそのまま検索し、
    // 取れなければフル取得→メモリ側フィルタの順でフォールバック
    let shiftsRaw: ShiftRow[] = [];
    {
        const try1 = await SB.from(SHIFT_VIEW).select("*").eq("shift_start_date", date);
        if (!try1.error && try1.data) {
            shiftsRaw = try1.data as ShiftRow[];
        } else {
            const try2 = await SB.from(SHIFT_VIEW).select("*").eq("date", date);
            if (!try2.error && try2.data) {
                shiftsRaw = try2.data as ShiftRow[];
            } else {
                const try3 = await SB.from(SHIFT_VIEW).select("*");
                if (try3.data) {
                    shiftsRaw = (try3.data as ShiftRow[]).filter((r) => {
                        const d = pickStr(r, ["shift_start_date", "date"], "");
                        return d === date;
                    });
                }
            }
        }
    }


    const toCard = (r: ShiftRow, staffId: string): RosterShiftCard => {
        const s = pickStr(r, ["start_at", "shift_start_time"], "00:00");
        const e = pickStr(r, ["end_at", "shift_end_time"], "00:00");
        const id = String(r.shift_id ?? "0");
        return {
            id: `${id}_${staffId}`,
            staff_id: staffId,
            start_at: hhmm(s),
            end_at: hhmm(e),
            client_name: pickStr(r, ["client_name"], ""),
            service_code: pickStr(r, ["service_code"], ""),
            service_name: pickStr(r, ["service_name"], ""),
        };
    };


    const cards: RosterShiftCard[] = [];
    for (const r of shiftsRaw) {
        const primary = pickStr(r, ["staff_id"], "");
        if (primary) cards.push(toCard(r, primary));
        const sub = pickStr(r, ["staff_user02_id"], "");
        if (sub) cards.push(toCard(r, sub));
    }


    return { date, staff, shifts: cards };
}

// 末尾などに追加
export const getDailyShiftView = getRosterDailyView;
