// src/lib/shift/shift-staff-check.ts
// 「直近N日シフトが無い（入社日 or 最後のシフトからN日以上）」スタッフが、これからのシフトに入っていたら
// 人事労務サポート（固定チャンネル）へ通知する

import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

const FIXED_CHANNEL_ID = "99142491";
const JST_OFFSET = "+09:00";

type RosterRow = {
    shift_id: number;
    shift_date: string; // YYYY-MM-DD
    start_at: string; // HH:mm:ss or HH:mm (text)
    end_at?: string | null;
    staff_id_1?: string | null;
    staff_id_2?: string | null;
    staff_id_3?: string | null;
    client_name?: string | null;
    kaipoke_cs_id?: string | null;
};

type UserRow = {
    user_id: string;
    lw_userid?: string | null;
    last_name_kanji?: string | null;
    first_name_kanji?: string | null;
    entry_date_original?: string | null; // YYYY-MM-DD
    entry_date_latest?: string | null; // YYYY-MM-DD
    status?: string | null;
};

export type ShiftStaffCheckResult = {
    ok: boolean;
    alerts: number;
    checkedShifts: number;
    sent: boolean;
    params: {
        dryRun: boolean;
        daysAhead: number;
        inactiveDays: number;
    };
    errors?: Array<{ message: string; code?: string; details?: string; hint?: string }>;
};

function parseAlertLine(line: string) {
    // 【最優先】2026/03/24 11:00 ...
    const m = line.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})/);
    if (!m) return { date: "", time: "" };

    return {
        date: `${m[1]}-${m[2]}-${m[3]}`,
        time: m[4],
    };
}

function toIsoDateJst(d: Date) {
    // YYYY-MM-DD (JST)
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}

function addDaysIsoDate(isoDate: string, days: number) {
    const base = new Date(`${isoDate}T00:00:00${JST_OFFSET}`);
    const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return toIsoDateJst(next);
}

function parseShiftStartMs(shiftDate: string, startAt: string | null | undefined) {
    const hhmm = (startAt ?? "00:00").split(":").slice(0, 2).join(":");
    const iso = `${shiftDate}T${hhmm}:00${JST_OFFSET}`;
    return new Date(iso).getTime();
}

function parseEntryMs(entryDate: string) {
    return new Date(`${entryDate}T00:00:00${JST_OFFSET}`).getTime();
}

function staffName(u?: UserRow | null) {
    const ln = (u?.last_name_kanji ?? "").trim();
    const fn = (u?.first_name_kanji ?? "").trim();
    const full = `${ln}${fn}`.trim();
    return full || u?.user_id || "（不明）";
}

// 既存コードと同様、mentionは <m userId="xxx">さん 形式に寄せる
function staffMention(u?: UserRow | null) {
    // LINEWORKSのチャンネル所属が保証できないため、mentionは使わない
    // （mentionすると「Mentioned user does not exist in the channel」で送信が失敗する）
    const name = staffName(u);
    const uid = (u?.user_id ?? "").trim();
    return uid ? `${name}さん（${uid}）` : `${name}さん`;
}

function clientDisplay(name: string) {
    const n = (name ?? "").trim() || "（利用者名不明）";
    return n.endsWith("様") ? n : `${n}様`;
}


function hhmm(startAt: string | null | undefined) {
    return (startAt ?? "00:00").split(":").slice(0, 2).join(":");
}

function weekdayIndexJst(isoDate: string) {
    // isoDate: YYYY-MM-DD
    return new Date(`${isoDate}T00:00:00${JST_OFFSET}`).getDay(); // 0=Sun
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

function yyyymmddSlash(isoDate: string) {
    return isoDate.replaceAll("-", "/");
}

function addDays(isoDate: string, days: number) {
    return addDaysIsoDate(isoDate, days);
}


function findPrevMs(sorted: number[], target: number) {
    // target より「小さい」最大値
    let lo = 0;
    let hi = sorted.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < target) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans >= 0 ? sorted[ans] : null;
}

export async function runShiftStaffCheck(opts: {
    now?: Date;
    dryRun?: boolean;
    daysAhead?: number;
    inactiveDays?: number;
} = {}): Promise<ShiftStaffCheckResult> {
    const now = opts.now ?? new Date();
    const dryRun = opts.dryRun ?? false;
    //const daysAhead = Number.isFinite(opts.daysAhead) ? (opts.daysAhead as number) : 21;
    //const daysAhead = 15; // 要望：今日〜直近15日以内に固定
    const daysAhead = Number.isFinite(opts.daysAhead) ? (opts.daysAhead as number) : 15;
    const inactiveDays = Number.isFinite(opts.inactiveDays) ? (opts.inactiveDays as number) : 15;

    const result: ShiftStaffCheckResult = {
        ok: true,
        alerts: 0,
        checkedShifts: 0,
        sent: false,
        params: { dryRun, daysAhead, inactiveDays },
    };

    try {
        const today = toIsoDateJst(now);
        const endDate = addDaysIsoDate(today, daysAhead);
        //const tomorrow = addDaysIsoDate(today, 1); // ← ★これを追加

        // 1) これからのシフト（対象期間）
        const { data: upcomingRaw, error: upcomingErr } = await supabaseAdmin
            .from("shift_csinfo_roster_view")
            .select("shift_id, shift_date, start_at, staff_id_1, staff_id_2, staff_id_3, client_name, kaipoke_cs_id")
            .gte("shift_date", today)
            .lte("shift_date", endDate)
            .not("kaipoke_cs_id", "like", "99999999%") // ✅ ①除外
            .order("shift_date", { ascending: true })
            .order("start_at", { ascending: true });

        if (upcomingErr) throw upcomingErr;

        const upcoming = (upcomingRaw as RosterRow[]) ?? [];
        result.checkedShifts = upcoming.length;

        if (upcoming.length === 0) return result;

        // 2) 対象スタッフID抽出
        const staffIds = new Set<string>();
        for (const r of upcoming) {
            for (const sid of [r.staff_id_1, r.staff_id_2, r.staff_id_3]) {
                const s = (sid ?? "").trim();
                if (s) staffIds.add(s);
            }
        }
        const staffIdList = Array.from(staffIds);
        if (staffIdList.length === 0) return result;

        // 3) スタッフ情報（入社日・lw_userid・氏名）
        const { data: usersRaw, error: usersErr } = await supabaseAdmin
            .from("user_entry_united_view_single")
            .select("user_id, lw_userid, last_name_kanji, first_name_kanji, entry_date_original, entry_date_latest, status")
            .in("user_id", staffIdList)
            .neq("status", "removed_from_lineworks_kaipoke")
            .neq("status", "inactive");

        if (usersErr) throw usersErr;

        const users = (usersRaw as UserRow[]) ?? [];
        const userMap = new Map<string, UserRow>();
        for (const u of users) userMap.set(u.user_id, u);

        // 4) 対象スタッフの「過去～未来」シフト（直近判定に使う）
        //    直近15日判定だが、シンプルに少し広めに取る（90日前～daysAhead先）
        const historyStart = addDaysIsoDate(today, -90);

        // staff_id_1/2/3 それぞれ in をかけて集める（or文字列組み立て事故を避ける）
        const [h1, h2, h3] = await Promise.all([
            supabaseAdmin
                .from("shift_csinfo_roster_view")
                .select("shift_id, shift_date, start_at, staff_id_1, staff_id_2, staff_id_3")
                .gte("shift_date", historyStart)
                .lte("shift_date", endDate)
                .in("staff_id_1", staffIdList),
            supabaseAdmin
                .from("shift_csinfo_roster_view")
                .select("shift_id, shift_date, start_at, staff_id_1, staff_id_2, staff_id_3")
                .gte("shift_date", historyStart)
                .lte("shift_date", endDate)
                .in("staff_id_2", staffIdList),
            supabaseAdmin
                .from("shift_csinfo_roster_view")
                .select("shift_id, shift_date, start_at, staff_id_1, staff_id_2, staff_id_3")
                .gte("shift_date", historyStart)
                .lte("shift_date", endDate)
                .in("staff_id_3", staffIdList),
        ]);

        if (h1.error) throw h1.error;
        if (h2.error) throw h2.error;
        if (h3.error) throw h3.error;

        const historyAll = ([] as RosterRow[])
            .concat((h1.data as RosterRow[]) ?? [])
            .concat((h2.data as RosterRow[]) ?? [])
            .concat((h3.data as RosterRow[]) ?? []);

        // staffごとの shiftStartMs の配列を作る
        const staffShiftMs = new Map<string, number[]>();
        for (const sid of staffIdList) staffShiftMs.set(sid, []);

        for (const r of historyAll) {
            const ms = parseShiftStartMs(r.shift_date, r.start_at);
            for (const sid of [r.staff_id_1, r.staff_id_2, r.staff_id_3]) {
                const s = (sid ?? "").trim();
                if (!s) continue;
                if (!staffShiftMs.has(s)) continue;
                staffShiftMs.get(s)!.push(ms);
            }
        }

        // sort + uniq（同じシフトが3回入ってもOKなように）
        for (const [sid, arr] of staffShiftMs.entries()) {
            arr.sort((a, b) => a - b);
            const uniq: number[] = [];
            for (const v of arr) {
                if (uniq.length === 0 || uniq[uniq.length - 1] !== v) uniq.push(v);
            }
            staffShiftMs.set(sid, uniq);
        }

        // 5) 判定してアラート作成
        const thresholdMs = inactiveDays * 24 * 60 * 60 * 1000;

        const alertLines: string[] = [];
        const dedupe = new Set<string>();

        // ------------------------------
        // （ロジック1）直近inactiveDays日シフトなしスタッフが未来シフトに入っている
        // ------------------------------
        for (const r of upcoming) {
            const shiftMs = parseShiftStartMs(r.shift_date, r.start_at);
            const startHHmm = hhmm(r.start_at);
            const dateDisp = yyyymmddSlash(r.shift_date);
            const clientName = clientDisplay(r.client_name ?? "");

            const staffCols = [r.staff_id_1, r.staff_id_2, r.staff_id_3];
            for (const sidRaw of staffCols) {
                const sid = (sidRaw ?? "").trim();
                if (!sid) continue;

                const key = `${r.shift_id}:${sid}`;
                if (dedupe.has(key)) continue;
                dedupe.add(key);

                const u = userMap.get(sid) ?? null;

                const entryDate = (u?.entry_date_original ?? u?.entry_date_latest ?? "").trim();
                const entryMs = entryDate ? parseEntryMs(entryDate) : null;

                const shifts = staffShiftMs.get(sid) ?? [];
                const prevMs = findPrevMs(shifts, shiftMs);
                const refMs = prevMs ?? entryMs;

                if (!refMs) continue;

                if (shiftMs - refMs >= thresholdMs) {
                    const who = staffMention(u);
                    alertLines.push(
                        `・${dateDisp} ${startHHmm}　${clientName} のシフトに ${who} が入っていますが、直近${inactiveDays}日はシフト勤務がありません。正しいシフトか確認をしてください。`
                    );
                }
            }
        }

        // ------------------------------
        // （ロジック2 改訂版）
        // 直近1か月の「曜日＋開始時刻」代表パターンから、今後daysAhead日分の期待日を作って
        // 「その日まるごと欠落」と「時間変更」を分けて検知する
        // ------------------------------
        {
            const PATTERN_DAYS = 30;
            const MIN_OCC = 2;

            const pastStart = addDays(today, -PATTERN_DAYS);
            const yesterday = addDays(today, -1);

            const { data: pastRaw, error: pastErr } = await supabaseAdmin
                .from("shift_csinfo_roster_view")
                .select("shift_date, start_at, client_name, kaipoke_cs_id")
                .gte("shift_date", pastStart)
                .lte("shift_date", yesterday)
                .not("kaipoke_cs_id", "like", "99999999%");

            if (pastErr) throw pastErr;

            type PastRow = Pick<RosterRow, "shift_date" | "start_at" | "client_name" | "kaipoke_cs_id">;
            const past = (pastRaw as PastRow[]) ?? [];

            const clientNameMap = new Map<string, string>();
            const cnt = new Map<string, number>();

            for (const r of past) {
                const clientKey = (r.kaipoke_cs_id ?? "").trim() || (r.client_name ?? "").trim();
                if (!clientKey) continue;

                clientNameMap.set(clientKey, (r.client_name ?? "").trim() || clientKey);

                const wd = weekdayIndexJst(r.shift_date);
                const st = hhmm(r.start_at);
                const key = `${clientKey}|${wd}|${st}`;
                cnt.set(key, (cnt.get(key) ?? 0) + 1);
            }

            const rep = new Map<string, { time: string; count: number }>();
            for (const [k, c] of cnt.entries()) {
                if (c < MIN_OCC) continue;
                const [clientKey, wdStr, st] = k.split("|");
                const wkKey = `${clientKey}|${wdStr}`;
                const cur = rep.get(wkKey);
                if (!cur || c > cur.count) rep.set(wkKey, { time: st, count: c });
            }

            type UpRow = Pick<RosterRow, "shift_date" | "start_at" | "client_name" | "kaipoke_cs_id">;
            const up = (upcomingRaw as UpRow[]) ?? [];

            // 未来データ: clientKey -> date -> starts
            const upMap = new Map<string, Map<string, Set<string>>>();
            for (const r of up) {
                const csid = (r.kaipoke_cs_id ?? "").trim();
                if (csid.startsWith("99999999")) continue;

                const clientKey = csid || (r.client_name ?? "").trim();
                if (!clientKey) continue;

                clientNameMap.set(clientKey, (r.client_name ?? "").trim() || clientKey);

                const date = r.shift_date;
                const st = hhmm(r.start_at);

                if (!upMap.has(clientKey)) upMap.set(clientKey, new Map());
                const dateMap = upMap.get(clientKey)!;
                if (!dateMap.has(date)) dateMap.set(date, new Set());
                dateMap.get(date)!.add(st);
            }

            const criticalMissingLines: string[] = [];
            const patternDiffLines: string[] = [];
            const dedupe2 = new Set<string>();

            for (const [wkKey, r] of rep.entries()) {
                const [clientKey, wdStr] = wkKey.split("|");
                const wd = Number(wdStr);
                const expected = r.time;

                for (let i = 0; i <= daysAhead; i++) {
                    const date = addDays(today, i);
                    if (weekdayIndexJst(date) !== wd) continue;

                    const dateMap = upMap.get(clientKey);
                    const startsSet = dateMap?.get(date) ?? new Set<string>();
                    const actualList = Array.from(startsSet).sort();

                    const k = `${clientKey}|${date}|${expected}`;
                    if (dedupe2.has(k)) continue;
                    dedupe2.add(k);

                    const clientDisp = clientDisplay(clientNameMap.get(clientKey) ?? clientKey);
                    const wdJa = WEEKDAY_JA[wd];

                    if (startsSet.size === 0) {
                        criticalMissingLines.push(
                            `【最優先】${yyyymmddSlash(date)} ${expected}　${clientDisp}　通常の同曜日シフト（${wdJa} ${expected}）が丸ごと存在しません。シフト漏れの可能性が高いため至急確認してください。`
                        );
                        continue;
                    }

                    if (!startsSet.has(expected)) {
                        patternDiffLines.push(
                            `・${yyyymmddSlash(date)} ${expected}　${clientDisp}　通常の同じ曜日のシフト（${wdJa} ${expected}）が、この日は見当たりません（時間が変更されています）。間違いありませんか？（当日登録: ${actualList.join(", ")}）`
                        );
                    }
                }
            }

            // 最優先を先頭へ
            alertLines.push(...criticalMissingLines, ...patternDiffLines);
        }

        // ------------------------------
        // （追加ロジック②）シフト担当者が未設定 / 特定できない（staff_01_user_id 起点）
        // 期間: 今日〜endDate（15日固定）
        // ------------------------------
        {
            // まず、未来15日の roster（upcoming）から shift_id -> client_name を引けるようにする
            const rosterByShiftId = new Map<number, { clientName: string; date: string; startAt: string }>();
            for (const r of upcoming) {
                // 99999999% は upcoming 側で除外している想定だが念のため
                const csid = (r.kaipoke_cs_id ?? "").trim();
                if (csid.startsWith("99999999")) continue;

                rosterByShiftId.set(r.shift_id, {
                    clientName: clientDisplay(r.client_name ?? ""),
                    date: r.shift_date,
                    startAt: hhmm(r.start_at),
                });
            }

            const shiftIds = Array.from(rosterByShiftId.keys());
            if (shiftIds.length > 0) {
                type ShiftRow = {
                    shift_id: number;
                    shift_start_date: string | null;
                    shift_start_time: string | null;
                    staff_01_user_id: string | null;
                    kaipoke_cs_id: string | null;
                    service_code: string | null;
                };

                const { data: shiftRaw, error: shiftErr } = await supabaseAdmin
                    .from("shift")
                    .select("shift_id, shift_start_date, shift_start_time, staff_01_user_id, kaipoke_cs_id, service_code")
                    .in("shift_id", shiftIds)
                    .gte("shift_start_date", today)
                    .lte("shift_start_date", endDate)
                    .not("kaipoke_cs_id", "like", "99999999%");

                if (shiftErr) throw shiftErr;

                const shifts = (shiftRaw as ShiftRow[]) ?? [];

                // キャンセル除外（SQLの条件に合わせる）
                const liveShifts = shifts.filter((s) => {
                    const sc = (s.service_code ?? "").trim();
                    if (!sc) return true; // null は別ロジック③で扱うのでここでは通してOK
                    return !/キャンセル/i.test(sc);
                });

                // staff_01_user_id を集める（空は reason 判定用に残す）
                const staffIds2 = Array.from(
                    new Set(
                        liveShifts
                            .map((s) => (s.staff_01_user_id ?? "").trim())
                            .filter((v) => v.length > 0)
                    )
                );

                // users を引く
                type UsersMini = { user_id: string; org_unit_id: string | null };
                const userMiniMap = new Map<string, UsersMini>();

                if (staffIds2.length > 0) {
                    const { data: umRaw, error: umErr } = await supabaseAdmin
                        .from("users")
                        .select("user_id, org_unit_id")
                        .in("user_id", staffIds2);

                    if (umErr) throw umErr;

                    const ums = (umRaw as UsersMini[]) ?? [];
                    for (const u of ums) userMiniMap.set(u.user_id, u);
                }

                // orgs を引く
                const orgUnitIds = Array.from(
                    new Set(
                        Array.from(userMiniMap.values())
                            .map((u) => (u.org_unit_id ?? "").trim())
                            .filter((v) => v.length > 0)
                    )
                );

                type OrgMini = { orgunitid: string; orgunitname: string | null };
                const orgMap = new Map<string, OrgMini>();

                if (orgUnitIds.length > 0) {
                    const { data: orgRaw, error: orgErr } = await supabaseAdmin
                        .from("orgs")
                        .select("orgunitid, orgunitname")
                        .in("orgunitid", orgUnitIds);

                    if (orgErr) throw orgErr;

                    const orgs = (orgRaw as OrgMini[]) ?? [];
                    for (const o of orgs) orgMap.set(String(o.orgunitid), o);
                }

                // 判定してアラートにする
                for (const s of liveShifts) {
                    const info = rosterByShiftId.get(s.shift_id);
                    if (!info) continue;

                    const staff01 = (s.staff_01_user_id ?? "").trim();

                    // reason判定（あなたのSQLに寄せる）
                    let reason: string | null = null;

                    if (!staff01) {
                        reason = "shift.staff_01_user_id empty";
                    } else {
                        const u = userMiniMap.get(staff01);
                        if (!u) {
                            reason = "users not found";
                        } else {
                            const ou = (u.org_unit_id ?? "").trim();
                            if (!ou) {
                                reason = "users.org_unit_id empty";
                            } else if (!orgMap.has(ou)) {
                                reason = "orgs master missing";
                            }
                        }
                    }

                    if (reason) {
                        // 表示形式：〇月〇日 〇時 ・・・様 のシフト担当者が特定されていない
                        alertLines.push(
                            `・${yyyymmddSlash(info.date)} ${info.startAt}　${info.clientName} のシフト担当者が特定されていません（${reason}）`
                        );
                    }
                }
            }
        }

        // ------------------------------
        // （追加ロジック③）シフトの service_code が未設定（null）
        // 期間: 今日〜endDate（15日固定）
        // ------------------------------
        {
            // upcoming から shift_id -> client/date/time を作る
            const rosterByShiftId = new Map<number, { clientName: string; date: string; startAt: string }>();
            for (const r of upcoming) {
                const csid = (r.kaipoke_cs_id ?? "").trim();
                if (csid.startsWith("99999999")) continue;

                rosterByShiftId.set(r.shift_id, {
                    clientName: clientDisplay(r.client_name ?? ""),
                    date: r.shift_date,
                    startAt: hhmm(r.start_at),
                });
            }

            const shiftIds = Array.from(rosterByShiftId.keys());
            if (shiftIds.length > 0) {
                type ShiftMini = { shift_id: number; service_code: string | null; kaipoke_cs_id: string | null };

                const { data: sRaw, error: sErr } = await supabaseAdmin
                    .from("shift")
                    .select("shift_id, service_code, kaipoke_cs_id")
                    .in("shift_id", shiftIds)
                    .gte("shift_start_date", today)
                    .lte("shift_start_date", endDate)
                    .not("kaipoke_cs_id", "like", "99999999%");

                if (sErr) throw sErr;

                const shifts = (sRaw as ShiftMini[]) ?? [];
                for (const s of shifts) {
                    // キャンセル除外（SQLに合わせる）
                    const sc = s.service_code;
                    if (sc && /キャンセル/i.test(sc)) continue;

                    if (s.service_code === null) {
                        const info = rosterByShiftId.get(s.shift_id);
                        if (!info) continue;

                        alertLines.push(
                            `・${yyyymmddSlash(info.date)} ${info.startAt}　${info.clientName} のシフトのサービスコードが未設定です`
                        );
                    }
                }
            }
        }


        // alertLines 先頭に "・YYYY/MM/DD" が来る想定で日付昇順ソート
        // alertLines 先頭に "・YYYY/MM/DD" / "【最優先】YYYY/MM/DD" が来る想定で
        // 日付 → 時刻 の昇順に並べる
        alertLines.sort((a, b) => {
            const pa = parseAlertLine(a);
            const pb = parseAlertLine(b);

            if (pa.date !== pb.date) return pa.date.localeCompare(pb.date);
            return pa.time.localeCompare(pb.time);
        });

        // 表示は最大10日分まで
        const MAX_DAYS = 10;
        const seenDates = new Set<string>();
        const limitedLines: string[] = [];

        for (const line of alertLines) {
            const { date } = parseAlertLine(line);

            // 日付が取れない行は一応そのまま通す
            if (!date) {
                limitedLines.push(line);
                continue;
            }

            if (!seenDates.has(date)) {
                if (seenDates.size >= MAX_DAYS) break;
                seenDates.add(date);
            }

            limitedLines.push(line);
        }

        const criticalLines = limitedLines.filter((x) => x.startsWith("【最優先】"));
        const normalLines = limitedLines.filter((x) => !x.startsWith("【最優先】"));

        const header =
            `【★★★シフト漏れチェック】確認放置しないこと\n` +
            `対象: ${today}〜${endDate}\n` +
            `最優先: 通常あるはずのシフトが丸ごと欠落している可能性\n` +
            `① 直近${inactiveDays}日シフトなしスタッフが未来シフト入り\n` +
            `② 直近1か月の「曜日＋開始時刻」パターン差分\n\n`;

        const bodyParts: string[] = [];
        if (criticalLines.length > 0) {
            bodyParts.push(
                "【最優先アラート】シフト漏れの可能性が高いもの",
                ...criticalLines,
                ""
            );
        }
        if (normalLines.length > 0) {
            bodyParts.push("【通常アラート】", ...normalLines);
        }

        const body = bodyParts.join("\n");
        const message = header + body;

        if (dryRun) {
            console.log("[DRY_RUN] send skipped. channelId=", FIXED_CHANNEL_ID);
            console.log(message);
            result.sent = false;
            return result;
        }

        const accessToken = await getAccessToken();

        // LINEWORKSの本文上限に当たりやすいので分割送信する
        const LIMIT = 1800; // 安全側（実上限より少し小さく）
        const parts: string[] = [];

        let current = header;
        for (const line of body.split("\n")) {
            // 1行追加すると超えるなら、いったん確定
            if ((current + line + "\n").length > LIMIT) {
                parts.push(current.trimEnd());
                current = header + line + "\n";
            } else {
                current += line + "\n";
            }
        }
        if (current.trim().length > 0) parts.push(current.trimEnd());

        // 最大でも数通に抑えたいので、念のため上限
        const MAX_PARTS = 5;
        const sendParts = parts.slice(0, MAX_PARTS);

        for (let i = 0; i < sendParts.length; i++) {
            const suffix = sendParts.length > 1 ? `\n\n（${i + 1}/${sendParts.length}）` : "";
            await sendLWBotMessage(FIXED_CHANNEL_ID, sendParts[i] + suffix, accessToken);
        }

        result.sent = true;


        return result;
    } catch (e) {
        result.ok = false;
        result.errors = [
            {
                message: String(e?.message ?? e),
                code: e?.code,
                details: e?.details,
                hint: e?.hint,
            },
        ];
        return result;
    }
}
