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
    const daysAhead = 15; // 要望：今日〜直近15日以内に固定
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
        // （ロジック2）直近1か月の「曜日＋開始時刻」パターンと、今日以降の差分チェック（差分方式）
        // ------------------------------
        {
            const PATTERN_DAYS = 30;
            const MIN_OCC = 2; // 直近1か月で2回以上のパターンのみ採用（ノイズ抑制）

            const pastStart = addDays(today, -PATTERN_DAYS);
            const yesterday = addDays(today, -1);

            // 直近1か月（過去30日）
            const { data: pastRaw, error: pastErr } = await supabaseAdmin
                .from("shift_csinfo_roster_view")
                .select("shift_date, start_at, client_name, kaipoke_cs_id")
                .gte("shift_date", pastStart)
                .lte("shift_date", yesterday);

            if (pastErr) throw pastErr;

            type PastRow = Pick<RosterRow, "shift_date" | "start_at" | "client_name" | "kaipoke_cs_id">;
            const past = (pastRaw as PastRow[]) ?? [];

            // 利用者表示名
            const clientNameMap = new Map<string, string>();

            // 過去の頻出パターン集計: clientKey|weekday|HH:mm -> count
            const patternCount = new Map<string, number>();

            for (const r of past) {
                const clientKey = (r.kaipoke_cs_id ?? "").trim() || (r.client_name ?? "").trim();
                if (!clientKey) continue;

                clientNameMap.set(clientKey, (r.client_name ?? "").trim() || clientKey);

                const wd = weekdayIndexJst(r.shift_date);
                const st = hhmm(r.start_at);

                const key = `${clientKey}|${wd}|${st}`;
                patternCount.set(key, (patternCount.get(key) ?? 0) + 1);
            }

            // expectedByClientWeekday: clientKey|weekday -> Set<HH:mm>
            const expectedByClientWeekday = new Map<string, Set<string>>();
            for (const [k, c] of patternCount.entries()) {
                if (c < MIN_OCC) continue;
                const [clientKey, wdStr, st] = k.split("|");
                const wkKey = `${clientKey}|${wdStr}`;
                if (!expectedByClientWeekday.has(wkKey)) expectedByClientWeekday.set(wkKey, new Set());
                expectedByClientWeekday.get(wkKey)!.add(st);
            }

            if (expectedByClientWeekday.size === 0) {
                // 期待パターンが作れないなら何もしない
            } else {
                // 今日以降（upcoming）を、利用者×日付にまとめる
                type UpRow = Pick<RosterRow, "shift_date" | "start_at" | "client_name" | "kaipoke_cs_id">;
                const up = (upcomingRaw as UpRow[]) ?? [];

                // map: clientKey -> date -> Set<HH:mm>
                const upMap = new Map<string, Map<string, Set<string>>>();

                for (const r of up) {
                    const clientKey = (r.kaipoke_cs_id ?? "").trim() || (r.client_name ?? "").trim();
                    if (!clientKey) continue;

                    clientNameMap.set(clientKey, (r.client_name ?? "").trim() || clientKey);

                    const date = r.shift_date;
                    const st = hhmm(r.start_at);

                    if (!upMap.has(clientKey)) upMap.set(clientKey, new Map());
                    const dateMap = upMap.get(clientKey)!;
                    if (!dateMap.has(date)) dateMap.set(date, new Set());
                    dateMap.get(date)!.add(st);
                }

                // 差分チェック：upMap に存在する「実際の未来日」だけをチェックする（総当たりしない）
                const alert2Dedupe = new Set<string>();

                for (const [clientKey, dateMap] of upMap.entries()) {
                    for (const [date, startsSet] of dateMap.entries()) {
                        const wd = weekdayIndexJst(date);
                        const wkKey = `${clientKey}|${wd}`;

                        const expectedSet = expectedByClientWeekday.get(wkKey);
                        if (!expectedSet || expectedSet.size === 0) continue; // 期待値なし

                        // 期待される開始時刻が、その日に1つも無いか？
                        const hasAnyExpected = Array.from(expectedSet).some((t) => startsSet.has(t));
                        if (hasAnyExpected) continue;

                        // 期待される各時刻について「その日には無い」ことを知らせる（ただし上限抑制のため最大2件）
                        const expectedList = Array.from(expectedSet).sort();
                        const actualList = Array.from(startsSet).sort();
                        const clientDisp = clientNameMap.get(clientKey) ?? clientKey;

                        const wdJa = WEEKDAY_JA[wd];

                        // 期待が多いとまた長くなるので、代表2件だけ出す
                        const show = expectedList.slice(0, 2);
                        const more = expectedList.length > 2 ? ` 他${expectedList.length - 2}件` : "";

                        for (const exp of show) {
                            const k = `${clientKey}|${date}|${exp}`;
                            if (alert2Dedupe.has(k)) continue;
                            alert2Dedupe.add(k);

                            alertLines.push(
                                `・${yyyymmddSlash(date)} ${exp}　${clientDisp} 様　直近1か月の同じ曜日のシフト（${wdJa} ${exp}）が、この日は見当たりません（時間が変更されています）。間違いありませんか？（当日登録: ${actualList.join(", ") || "なし"}）${more}`
                            );
                        }
                    }
                }
            }
        }

        result.alerts = alertLines.length;

        // 6) 送信
        if (alertLines.length === 0) {
            return result; // 何も無ければ送らない
        }

        const header =
            `【★★★シフト漏れチェック】確認放置しないこと\n` +
            `対象: ${today}〜${endDate}\n` +
            `① 直近${inactiveDays}日シフトなしスタッフが未来シフト入り\n` +
            `② 直近1か月の「曜日＋開始時刻」パターン差分\n\n`;

        const maxLines = 80;
        const body =
            alertLines.length <= maxLines
                ? alertLines.join("\n")
                : alertLines.slice(0, maxLines).join("\n") + `\n…他${alertLines.length - maxLines}件`;

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
