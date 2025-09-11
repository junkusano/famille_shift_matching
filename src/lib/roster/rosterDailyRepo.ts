// ----------------------------------------------
// lib/roster/rosterDailyRepo.ts（CSVプロトタイプ → DB差替えポイント）
// ----------------------------------------------
import fs from "fs/promises";
import { RosterDailyView, RosterShiftCard, RosterStaff } from "@/types/roster";

export async function getRosterDailyView(date: string): Promise<RosterDailyView> {
    const rows = await fetchShiftRowsFromCsv(date);
    const staff = await buildStaffFromRows(rows);
    const shifts: RosterShiftCard[] = [];
    for (const r of rows) {
        const staffIds = [r.staff_01_user_id, r.staff_02_user_id, r.staff_03_user_id].filter(Boolean).map(String);
        for (const sid of staffIds) {
            shifts.push({
                id: `${r.shift_id}_${sid}`,
                staff_id: sid,
                start_at: hhmm(r.shift_start_time),
                end_at: hhmm(r.shift_end_time),
                client_name: r.name || "",
                service_code: r.service_code || "",
                service_name: r.service_name || r.require_doc_group || r.kaipoke_servicek || "",
            });
        }
    }

    // デフォルト並び: team → level → name
    const staffSorted = staff
        .filter((u, i, self) => self.findIndex(x => x.id === u.id) === i)
        .sort((a, b) => (a.team || "").localeCompare(b.team || "") || (a.level || "").localeCompare(b.level || "") || a.name.localeCompare(b.name));

    return { date, staff: staffSorted, shifts };
}

// --- CSV 推定スキーマ ---
export type CsvShiftRow = {
    shift_id: number;
    shift_start_date: string;   // YYYY-MM-DD
    shift_start_time: string;   // HH:mm:ss
    shift_end_time: string;     // HH:mm:ss
    name?: string | null;       // 利用者名
    staff_01_user_id?: string | null;
    staff_02_user_id?: string | null;
    staff_03_user_id?: string | null;
    service_code?: string | null;
    service_name?: string | null;
    require_doc_group?: string | null;
    kaipoke_servicek?: string | null;
    // もしCSVに含まれていれば
    staff_01_team?: string | null; staff_01_level?: string | null;
    staff_02_team?: string | null; staff_02_level?: string | null;
    staff_03_team?: string | null; staff_03_level?: string | null;
};

function hhmm(ss?: string | null): string {
    if (!ss) return "00:00";
    const [h, m] = ss.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

async function fetchShiftRowsFromCsv(date: string): Promise<CsvShiftRow[]> {
    const path = process.env.SHIFT_CSV_PATH || "/mnt/data/shift_csinfo_postalname_view_rows (3).csv";
    const text = await fs.readFile(path, "utf-8");

    // ❶ 生CSV → 汎用レコード配列
    const rawRecords = parseCsv(text); // Record<string, string | null>[]

    // ❷ 型安全に CsvShiftRow へマッピング
    const rows = rawRecords
        .map(toCsvShiftRowSafe)
        .filter((r): r is CsvShiftRow => r !== null)           // 不正行を除外
        .filter(r => r.shift_start_date === date);             // 日付で絞り込み

    return rows;
}

async function buildStaffFromRows(rows: CsvShiftRow[]): Promise<RosterStaff[]> {
    const map = new Map<string, RosterStaff>();
    const add = (id?: string | null, team?: string | null, level?: string | null) => {
        if (!id) return;
        const key = String(id);
        if (!map.has(key)) map.set(key, { id: key, name: key, team: team ?? null, level: level ?? null });
    };
    for (const r of rows) {
        add(r.staff_01_user_id, r.staff_01_team, r.staff_01_level);
        add(r.staff_02_user_id, r.staff_02_team, r.staff_02_level);
        add(r.staff_03_user_id, r.staff_03_team, r.staff_03_level);
    }
    return Array.from(map.values());
}

/** 汎用レコード → CsvShiftRow（不足・変換失敗は null で返す） */
function toCsvShiftRowSafe(rec: Record<string, string | null>): CsvShiftRow | null {
    const get = (k: string) => rec[k] ?? null;

    // shift_id は必須。代表候補を順に見る
    const shiftIdStr = get("shift_id") ?? get("id");
    const shift_id = shiftIdStr ? Number(shiftIdStr) : NaN;

    const shift_start_date = get("shift_start_date") ?? get("date");
    const shift_start_time = get("shift_start_time") ?? get("start_time") ?? get("startAt");
    const shift_end_time = get("shift_end_time") ?? get("end_time") ?? get("endAt");

    if (!Number.isFinite(shift_id) || !shift_start_date || !shift_start_time || !shift_end_time) {
        return null; // 必須が無ければ破棄
    }

    return {
        shift_id,
        shift_start_date,
        shift_start_time,
        shift_end_time,
        name: get("name") ?? get("client_name"),
        staff_01_user_id: get("staff_01_user_id") ?? get("staff_user01_id") ?? get("staff_user_id"),
        staff_02_user_id: get("staff_02_user_id") ?? get("staff_user02_id") ?? null,
        staff_03_user_id: get("staff_03_user_id") ?? get("staff_user03_id") ?? null,
        service_code: get("service_code"),
        service_name: get("service_name"),
        require_doc_group: get("require_doc_group"),
        kaipoke_servicek: get("kaipoke_servicek"),
        staff_01_team: get("staff_01_team"),
        staff_01_level: get("staff_01_level"),
        staff_02_team: get("staff_02_team"),
        staff_02_level: get("staff_02_level"),
        staff_03_team: get("staff_03_team"),
        staff_03_level: get("staff_03_level"),
    };
}

// --- 簡易CSVパーサ（引用対応） ---
function parseCsv(text: string): Record<string, string | null>[] {
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
        const cols = splitCsvLine(line);
        const obj: Record<string, string | null> = Object.create(null);
        headers.forEach((h, i) => { obj[h] = cols[i] ?? null; });
        return obj;
    });
}

function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { quoted = !quoted; continue; }
        if (ch === "," && !quoted) { out.push(cur); cur = ""; continue; }
        cur += ch;
    }
    out.push(cur);
    return out;
}

// --- DB切替の目安 ---
// getRosterDailyView(date):
//  - CSV取得(fetchShiftRowsFromCsv) → DB取得（prisma/kysely/sql等）へ置換
//  - staffは user テーブルから id, name, team, level を取得して返す
//  - shiftsは shift テーブルから取得し、複数担当は staff_id ごとに複製
