// src/lib/supabase/analyzeTalksAndDispatchToRPA.ts
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import { rpaInstructionPrompt } from "@/lib/supabase/rpaInstructionPrompt";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { insertShifts } from "@/lib/supabase/shiftAdd";
import { deleteShifts } from "@/lib/supabase/shiftDelete";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type GroupedTalk = {
    ids: number[];
    talks: { role: "user" | "assistant" | "system"; content: string }[];
};

type GroupMember = {
    externalKey: string;
    id: string;
    type: "USER" | "ORGUNIT" | "GROUP";
};

// ---- 厳密型（shiftAdd/shiftDelete が期待している形）----
type DeletionDetail = { shift_date: string; shift_time: string };
type ShiftDeleteRequest = { group_account: string; deletions: DeletionDetail[] };

type AdditionDetail = {
    user_id: string;
    shift_date: string;
    shift_time: string;
    service_code?: string;
};
type ShiftAddRequest = { group_account: string; additions: AdditionDetail[] };

// ---- AI出力（ゆるい入力）----
type ShiftDeletionItem = { shift_date?: string; shift_time?: string };
type ShiftDeletionRequest = { group_account: string; deletions: ShiftDeletionItem[] };

type ShiftAdditionItem = {
    shift_date?: string;
    shift_time?: string; // "08:30-09:00" / "朝" / undefined など
    service_code?: string;
    user_id?: string; // メンション解析済みなら入る可能性あり
};
type ShiftInsertionRequest = {
    group_account: string;
    requested_by_user_id?: string; // 補完に使う
    insertions?: ShiftAdditionItem[];
    additions?: ShiftAdditionItem[];
    shifts?: ShiftAdditionItem[];
};

type DeletePayload = {
    template_id: "9bcfa71a-e800-4b49-a6aa-b80016b4b683";
    request_detail: ShiftDeletionRequest;
};
type InsertPayload = {
    template_id: "2f9dacc7-92bc-4888-8ff3-eadca4e4f75a";
    request_detail: ShiftInsertionRequest;
};

// どこか上（ShiftRow が定義済みならその直後あたり）に追加
type StaffLike = {
    staff_01_user_id?: string | null;
    staff_02_user_id?: string | null;
    staff_03_user_id?: string | null;
};

type HasStartTime = { shift_start_time?: string | null };

// ---------- ユーティリティ（時間帯/フォーマット/探索） ----------
const DAYPART = {
    MORNING: { key: "morning", start: "05:00", end: "11:00", kw: ["朝", "午前", "朝イチ", "朝一"] },
    AFTERNOON: { key: "noon", start: "11:00", end: "16:00", kw: ["昼", "正午", "午後", "お昼"] },
    EVENING: { key: "evening", start: "16:00", end: "22:00", kw: ["夕", "夕方", "夜", "宵"] },
} as const;

function hhmm(t: string | null | undefined): string | null {
    if (!t) return null;
    // "08:30:00" -> "08:30"
    const m = t.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : null;
}
function toRange(start: string | null, end: string | null): string | null {
    if (!start || !end) return null;
    return `${start}-${end}`;
}
function isConcreteRange(s?: string): boolean {
    return !!s && /^\d{1,2}:\d{2}\s*[-~]\s*\d{1,2}:\d{2}$/.test(s);
}
function detectDaypartKey(s?: string): keyof typeof DAYPART | null {
    if (!s) return null;
    const text = s.replace(/\s/g, "");
    for (const k of Object.keys(DAYPART) as Array<keyof typeof DAYPART>) {
        if (DAYPART[k].kw.some((w) => text.includes(w))) return k;
    }
    return null;
}
function within(t: string, start: string, end: string): boolean {
    return t >= start && t < end;
}
function firstStaffOf(row: StaffLike | null | undefined): string | null {
    const ids = [
        row?.staff_01_user_id,
        row?.staff_02_user_id,
        row?.staff_03_user_id,
    ];
    const hit = ids.find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
    );
    return hit ?? null;
}

// 直近/周辺のシフトを拾う
async function getAroundShifts(
    group_account: string,
    baseDate: string,
    beforeN = 5,
    afterN = 5
) {
    const before = await supabase
        .from("shift")
        .select(
            "shift_start_date, shift_start_time, shift_end_time, service_code, staff_01_user_id, staff_02_user_id, staff_03_user_id"
        )
        .eq("kaipoke_cs_id", group_account)
        .lte("shift_start_date", baseDate)
        .order("shift_start_date", { ascending: false })
        .order("shift_start_time", { ascending: false })
        .limit(beforeN);

    const after = await supabase
        .from("shift")
        .select(
            "shift_start_date, shift_start_time, shift_end_time, service_code, staff_01_user_id, staff_02_user_id, staff_03_user_id"
        )
        .eq("kaipoke_cs_id", group_account)
        .gte("shift_start_date", baseDate)
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true })
        .limit(afterN);

    return {
        before: before.data ?? [],
        after: after.data ?? [],
    };
}

async function getLastShiftBefore(group_account: string, baseDate: string) {
    const { data } = await supabase
        .from("shift")
        .select(
            "shift_start_date, shift_start_time, shift_end_time, service_code, staff_01_user_id, staff_02_user_id, staff_03_user_id"
        )
        .eq("kaipoke_cs_id", group_account)
        .lt("shift_start_date", baseDate)
        .order("shift_start_date", { ascending: false })
        .order("shift_start_time", { ascending: false })
        .limit(1);
    return (data ?? [])[0] ?? null;
}

function pickByDaypart<T extends HasStartTime>(
    rows: readonly T[],
    k: keyof typeof DAYPART
): T | null {
    const { start, end } = DAYPART[k];
    for (const r of rows) {
        const st = hhmm(r?.shift_start_time);
        if (st && within(st, start, end)) return r;
    }
    return null;
}

// ---------- ★ ゆるい追加 → まず補完（①〜③） → 厳密化 ----------
async function enrichInsertRequest(
    req: ShiftInsertionRequest
): Promise<ShiftInsertionRequest> {
    const src =
        (Array.isArray(req.insertions) && req.insertions) ||
        (Array.isArray(req.additions) && req.additions) ||
        (Array.isArray(req.shifts) && req.shifts) ||
        [];

    const out: ShiftAdditionItem[] = [];

    for (const item of src) {
        const date = (item.shift_date ?? "").trim();
        let time = (item.shift_time ?? "").trim(); // "朝" 等もありうる
        let userId = (item.user_id ?? req.requested_by_user_id ?? "").trim();
        let svc = (item.service_code ?? "").trim();

        if (!date) {
            // 日付が無いのは補完しづらいので素通し（のちの厳密化でエラーにさせる）
            out.push({ shift_date: date, shift_time: time, user_id: userId || undefined, service_code: svc || undefined });
            continue;
        }

        // --- ② 朝/夕などの曖昧指定 → 周辺（前後5件）から該当時間帯の代表をコピー ---
        const daypartKey = detectDaypartKey(time);
        if (!isConcreteRange(time) && daypartKey) {
            const around = await getAroundShifts(req.group_account, date, 5, 5);
            // 前後5件の中から時間帯に合う開始時刻の案件を拾う
            const candidate = pickByDaypart(
                [...around.before, ...around.after],
                daypartKey
            );
            if (candidate) {
                const st = hhmm(candidate.shift_start_time);
                const et = hhmm(candidate.shift_end_time);
                const range = toRange(st, et);
                if (range) time = range;
                if (!svc) svc = candidate.service_code ?? "";
                if (!userId) userId = firstStaffOf(candidate) ?? "";
            }
        }

        // --- ① 完全に時間指定が無い（"朝/夕"さえ無し）→ 直近の“ひとつ前”をコピー ---
        if (!isConcreteRange(time) && !daypartKey) {
            const prev = await getLastShiftBefore(req.group_account, date);
            if (prev) {
                const st = hhmm(prev.shift_start_time);
                const et = hhmm(prev.shift_end_time);
                const range = toRange(st, et);
                if (range) time = range;
                if (!svc) svc = prev.service_code ?? "";
                if (!userId) userId = firstStaffOf(prev) ?? "";
            }
        }

        // ③ 担当者がまだ決まってない場合、②/①で見つけた候補の担当をコピー済み（上記）
        // ここまでで埋まらなければ、requested_by_user_id を最後に使う（既に適用済み）

        out.push({
            shift_date: date || undefined,
            shift_time: time || undefined,
            user_id: userId || undefined,
            service_code: svc || undefined,
        });
    }

    // 元の形を保って返す（上書き）
    return {
        ...req,
        insertions: out,
        additions: undefined,
        shifts: undefined,
    };
}

function toStrictAdd(req: ShiftInsertionRequest): ShiftAddRequest | { error: string } {
    const src =
        (Array.isArray(req.insertions) && req.insertions) ||
        (Array.isArray(req.additions) && req.additions) ||
        (Array.isArray(req.shifts) && req.shifts) ||
        [];

    const additions: AdditionDetail[] = [];
    for (const a of src) {
        const shift_date = (a.shift_date ?? "").trim();
        const shift_time = (a.shift_time ?? "").trim();
        const user_id = (a.user_id ?? req.requested_by_user_id ?? "").trim();

        if (!shift_date || !shift_time) return { error: "shift_date/shift_time が不足しています（追加）" };
        if (!user_id) return { error: "user_id が不足しています（追加の割当先）" };

        additions.push({
            user_id,
            shift_date,
            shift_time,
            service_code: a.service_code ? a.service_code.trim() : undefined,
        });
    }
    return { group_account: req.group_account, additions };
}

// ---------- type guard ----------
function isDeletePayload(x: unknown): x is DeletePayload {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    if (o.template_id !== "9bcfa71a-e800-4b49-a6aa-b80016b4b683") return false;
    const d = o.request_detail;
    if (!d || typeof d !== "object") return false;
    const r = d as Record<string, unknown>;
    return typeof r.group_account === "string" && Array.isArray(r.deletions);
}
function isInsertPayload(x: unknown): x is InsertPayload {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    if (o.template_id !== "2f9dacc7-92bc-4888-8ff3-eadca4e4f75a") return false;
    const d = o.request_detail;
    if (!d || typeof d !== "object") return false;
    const r = d as Record<string, unknown>;
    return (
        typeof r.group_account === "string" &&
        (Array.isArray(r.insertions) || Array.isArray(r.additions) || Array.isArray(r.shifts))
    );
}

//type DayRowLite = { shift_start_time: string | null; shift_end_time: string | null };

// ===== begin: helpers for deletion fallback =====
type ShiftRowLite = { shift_start_time: string | null; shift_end_time: string | null };

function hhmm5(t?: string | null): string {
    return (t ?? '').slice(0, 5);
}

function tToMinutes(t: string): number | null {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

function parseRange(raw: string): { startMin: number; endMin: number | null } | null {
    const s = raw.trim();
    const m1 = s.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    const m2 = s.match(/^(\d{1,2}:\d{2})$/);
    if (m1) {
        const a = tToMinutes(m1[1]);
        const b = tToMinutes(m1[2]);
        if (a !== null && b !== null) return { startMin: a, endMin: b };
        return null;
    }
    if (m2) {
        const a = tToMinutes(m2[1]);
        if (a !== null) return { startMin: a, endMin: null };
        return null;
    }
    return null;
}

type TimeHint = 'morning' | 'noon' | 'evening' | 'night' | 'deep' | null;

function parseTimeHint(input?: string): TimeHint {
    if (!input) return null;
    const s = input.replace(/\s/g, '').toLowerCase();
    if (/(朝|モーニング|午前|am)/.test(s)) return 'morning';
    if (/(昼|正午|ランチ|お昼)/.test(s)) return 'noon';
    if (/(夕|夕方|夕刻|夕食|pm)/.test(s)) return 'evening';
    if (/(夜|ナイト|夜間)/.test(s)) return 'night';
    if (/(深夜|未明)/.test(s)) return 'deep';
    if (/\d{1,2}:\d{2}(-\d{1,2}:\d{2})?$/.test(s)) return null; // 既に時刻
    return null;
}

function hintWindow(h: TimeHint): { startMin: number; endMin: number; centerMin: number } | null {
    switch (h) {
        case 'deep': return { startMin: 0, endMin: 300, centerMin: 150 }; // 00:00-05:00
        case 'morning': return { startMin: 300, endMin: 660, centerMin: 480 }; // 05:00-11:00
        case 'noon': return { startMin: 660, endMin: 840, centerMin: 750 }; // 11:00-14:00
        case 'evening': return { startMin: 960, endMin: 1140, centerMin: 1050 }; // 16:00-19:00
        case 'night': return { startMin: 1140, endMin: 1440, centerMin: 1320 }; // 19:00-24:00
        default: return null;
    }
}

function splitIntoContiguousChains(rows: ShiftRowLite[]): ShiftRowLite[][] {
    if (rows.length === 0) return [];
    const chains: ShiftRowLite[][] = [];
    let cur: ShiftRowLite[] = [rows[0]];
    for (let i = 1; i < rows.length; i++) {
        const prev = cur[cur.length - 1];
        const now = rows[i];
        if (hhmm5(prev.shift_end_time) === hhmm5(now.shift_start_time)) {
            cur.push(now);
        } else {
            chains.push(cur);
            cur = [now];
        }
    }
    chains.push(cur);
    return chains;
}

function isTimeUnknown(raw: string): boolean {
    const s = (raw ?? '').trim();
    if (!s || s === '不明') return true;
    return !/\d{1,2}:\d{2}/.test(s); // 時刻が1つも含まれない
}
// ===== end: helpers for deletion fallback =====

async function resolveDeletionTimes(
    req: ShiftDeletionRequest
): Promise<ShiftDeleteRequest> {
    const out: DeletionDetail[] = [];

    for (const item of req.deletions ?? []) {
        const date = (item.shift_date ?? '').trim();
        const rawTime = (item.shift_time ?? '').trim();
        if (!date) continue;

        // 当日の候補（開始時刻昇順）
        const { data } = await supabase
            .from('shift')
            .select('shift_start_time, shift_end_time')
            .eq('kaipoke_cs_id', req.group_account)
            .eq('shift_start_date', date)
            .order('shift_start_time', { ascending: true });

        const rows: ShiftRowLite[] = (data ?? []) as ShiftRowLite[];

        // A) 時間未指定: 同日1件 or 連結チェーン1本ならそれを自動確定
        if (isTimeUnknown(rawTime)) {
            if (rows.length === 1) {
                const st = hhmm5(rows[0].shift_start_time);
                const et = hhmm5(rows[0].shift_end_time);
                out.push({ shift_date: date, shift_time: et ? `${st}-${et}` : st });
                continue;
            }
            if (rows.length > 1) {
                const chains = splitIntoContiguousChains(rows);
                if (chains.length === 1) {
                    for (const r of chains[0]) {
                        const st = hhmm5(r.shift_start_time);
                        const et = hhmm5(r.shift_end_time);
                        out.push({ shift_date: date, shift_time: et ? `${st}-${et}` : st });
                    }
                    continue;
                }
            }
            // 候補0件 or チェーン複数 → 従来どおり
            out.push({ shift_date: date, shift_time: rawTime || '不明' });
            continue;
        }

        // B) ヒント/明示時間あり → 既存の近似ロジック
        if (rows.length === 0) {
            out.push({ shift_date: date, shift_time: rawTime });
            continue;
        }

        const hint = parseTimeHint(rawTime);
        let chosen: ShiftRowLite | null = null;

        if (hint) {
            const w = hintWindow(hint);
            if (w) {
                const scored = rows
                    .map((r) => {
                        const st = hhmm5(r.shift_start_time);
                        const m = tToMinutes(st);
                        return { r, m };
                    })
                    .filter((x) => x.m !== null) as { r: ShiftRowLite; m: number }[];
                const inWin = scored.filter((x) => x.m >= w.startMin && x.m < w.endMin);
                inWin.sort((a, b) => Math.abs(a.m - w.centerMin) - Math.abs(b.m - w.centerMin));
                chosen = inWin[0]?.r ?? null;
            }
        } else {
            const pr = parseRange(rawTime);
            if (pr) {
                const TOL = 90; // 分
                const scored = rows
                    .map((r) => {
                        const st = hhmm5(r.shift_start_time);
                        const m = tToMinutes(st);
                        return { r, m };
                    })
                    .filter((x) => x.m !== null) as { r: ShiftRowLite; m: number }[];
                const inTol = scored
                    .map((x) => ({ r: x.r, diff: Math.abs(x.m - pr.startMin) }))
                    .filter((s) => s.diff <= TOL)
                    .sort((a, b) => a.diff - b.diff);
                chosen = inTol[0]?.r ?? null;
            }
        }

        if (chosen) {
            const st = hhmm5(chosen.shift_start_time);
            const et = hhmm5(chosen.shift_end_time);
            out.push({ shift_date: date, shift_time: et ? `${st}-${et}` : st });
        } else {
            out.push({ shift_date: date, shift_time: rawTime });
        }
    }

    return { group_account: req.group_account, deletions: out };
}


// ---------- メイン ----------
const analyzePendingTalksAndDispatch = async (): Promise<void> => {
    const { data: logs, error } = await supabase
        .from("msg_lw_log_with_group_account")
        .select("id, user_id, channel_id, message, timestamp, group_account")
        .eq("status", 0)
        .eq("event_type", "message")
        .neq("message", null)
        .eq("is_numeric_group_account", true)
        .order("timestamp", { ascending: true });

    console.log("Supabase status fetch error:", error);
    console.log("logs:", logs);

    if (error || !logs || logs.length === 0) return;

    const grouped: Record<string, GroupedTalk> = logs.reduce((acc, log) => {
        const key = log.channel_id || `user:${log.user_id}`;
        if (!acc[key]) acc[key] = { ids: [], talks: [] };
        acc[key].ids.push(log.id);
        acc[key].talks.push({ role: "user", content: log.message });
        return acc;
    }, {} as Record<string, GroupedTalk>);

    for (const [channel_id, { ids, talks }] of Object.entries(grouped)) {
        if (talks.length === 0) continue;

        const baseLog = logs.find((log) => ids.includes(log.id));
        const group_account = baseLog?.group_account || "不明";
        const timestampUtc = baseLog?.timestamp || new Date().toISOString();
        const jstDate = new Date(timestampUtc);
        jstDate.setHours(jstDate.getHours() + 9);
        const timestamp = jstDate.toISOString().replace("T", " ").replace(".000Z", "");

        const accessToken = await getAccessToken();

        // メンバー取得（@メンション解決用）
        const groupRes = await fetch(`https://www.worksapis.com/v1.0/groups/${channel_id}/members`, {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
        const groupData = (await groupRes.json()) as { members?: GroupMember[] };
        const members: GroupMember[] = groupData.members ?? [];

        const mentionMap = members
            .filter((m): m is GroupMember & { type: "USER" } => m.type === "USER")
            .map((m) => ({ name: m.externalKey, user_id: m.id }));

        const messages: ChatCompletionMessageParam[] = [
            rpaInstructionPrompt,
            { role: "system", content: `この会話は group_account=${group_account} のやりとりです。` },
            { role: "system", content: `この会話の基準日（最終発言時刻）は ${timestamp} です。` },
            {
                role: "system",
                content:
                    `この会話には以下のメンションがあります（JSON）。@名前 → user_id の対応表:\n` +
                    JSON.stringify(mentionMap, null, 2),
            },
            ...talks.map((t) => ({ role: t.role, content: t.content })),
        ];

        const ai = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            temperature: 0,
        });

        const responseText = (ai.choices?.[0]?.message?.content ?? "").trim();
        console.log("🔍 AI応答内容:", responseText);

        await supabase.from("msg_lw_analysis_log").insert({
            timestamp: new Date().toISOString(),
            channel_id: channel_id,
            text: responseText,
            reason: responseText.toLowerCase() === "処理なし" ? "処理不要" : "処理判定済",
        });

        if (responseText.trim() === "処理なし") {
            for (const id of ids) {
                const { error: updateErr } = await supabase.from("msg_lw_log").update({ status: 2 }).eq("id", id);
                if (updateErr) console.error(`❌ Update failed for id=${id} (status=2):`, updateErr.message);
            }
            continue;
        }

        try {
            let cleanedText = responseText;
            if (cleanedText.startsWith("```") && cleanedText.endsWith("```")) {
                cleanedText = cleanedText.replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
            }

            const parsed = JSON.parse(cleanedText) as unknown;

            // RPA登録用に（後段共通）
            let templateIdForRPA: string | null = null;
            let requestDetailForRPA: unknown = null;

            // ===== 削除 =====
            if (isDeletePayload(parsed)) {
                const { request_detail } = parsed;
                templateIdForRPA = parsed.template_id;
                requestDetailForRPA = request_detail;

                console.log("🚀 シフト削除リクエストを検知。shiftテーブルから直接削除を試行します。");
                const delReqResolved = await resolveDeletionTimes(request_detail as ShiftDeletionRequest);
                const delResult = await deleteShifts(delReqResolved);
                const rawErrs = delResult && typeof delResult === "object" && "errors" in delResult
                    ? (delResult as { errors?: unknown }).errors
                    : undefined;

                const errs: string[] = Array.isArray(rawErrs)
                    ? rawErrs.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
                    : [];

                const ok =
                    delResult &&
                    typeof delResult === "object" &&
                    "success" in delResult &&
                    Boolean((delResult as { success?: boolean }).success);

                if (ok) {
                    const lines: string[] = ["✅ シフト削除を反映しました。"];
                    for (const d of request_detail.deletions) {
                        lines.push(
                            `・利用者: ${request_detail.group_account} / 日付: ${d.shift_date ?? "不明"} / 時間: ${d.shift_time ?? "不明"}`
                        );
                    }
                    lines.push("", "※ 反映には時間がかかる場合があります。");
                    await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                } else {
                    const isMissing = errs.some((e) => e.includes("必須情報不足"));
                    const isNotFound = errs.some((e) => e.includes("見つかりません") || e.toLowerCase().includes("not found"));

                    let header = "⚠️ シフト削除に失敗しました。";
                    if (isMissing) header = "⚠️ シフト削除できませんでした（必須情報が不足しています）。";
                    else if (isNotFound) header = "⚠️ シフト削除警告: 対象シフトが見つかりませんでした。";

                    const lines: string[] = [header];
                    for (const d of request_detail.deletions) {
                        lines.push(
                            `・利用者: ${request_detail.group_account} / 日付: ${d.shift_date ?? "不明"} / 時間: ${d.shift_time ?? "不明"}`
                        );
                    }
                    if (isMissing) {
                        lines.push("", "例）「10/13 08:00 のシフトを削除」 のように日時を一緒に送ってください。");
                    } else if (isNotFound) {
                        lines.push("", "候補：時間の表記ゆれ（08:00 / 8:00 / 8:00-9:00）や別日の同名案件が無いかをご確認ください。");
                    }
                    if (errs.length > 0) lines.push("", `詳細: ${errs[0]}`);
                    await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                }
            }

            // ===== 追加 =====
            if (isInsertPayload(parsed)) {
                const { request_detail } = parsed;
                templateIdForRPA = parsed.template_id;
                requestDetailForRPA = request_detail;

                console.log("🚀 シフト追加リクエストを検知。時間/担当/サービス補完を試行します（①〜③）。");

                // ★ まず補完（①〜③）
                const enriched = await enrichInsertRequest(request_detail);

                // ★ 補完後に厳密化（欠けていればここでエラー：④）
                const addReqConv = toStrictAdd(enriched);
                if ("error" in addReqConv) {
                    await sendLWBotMessage(
                        channel_id,
                        ["⚠️ シフト追加できませんでした（必須情報が不足しています）。", `・理由: ${addReqConv.error}`].join("\n"),
                        accessToken
                    );
                } else {
                    // 実行
                    const insertResult = await insertShifts(addReqConv);
                    const ok =
                        insertResult &&
                        typeof insertResult === "object" &&
                        "success" in insertResult &&
                        (insertResult as { success: boolean }).success;

                    if (ok) {
                        // ⑤ 成功通知（日時・サービスコード・担当者）
                        const addedList =
                            enriched.insertions ??
                            enriched.additions ??
                            enriched.shifts ??
                            [];
                        const lines: string[] = ["✅ シフト追加を登録しました。"];
                        for (const a of addedList) {
                            lines.push(
                                `・利用者: ${enriched.group_account} / 日付: ${a.shift_date ?? "不明"} / 時間: ${a.shift_time ?? "不明"} / 種別:${a.service_code ?? "未指定"} / 担当:${a.user_id ?? (enriched.requested_by_user_id ?? "未指定")}`
                            );
                        }
                        lines.push("", "※ 反映には時間がかかる場合があります。");
                        await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                    } else {
                        const rawErrs =
                            insertResult && typeof insertResult === "object" && "errors" in insertResult
                                ? (insertResult as { errors?: unknown }).errors
                                : undefined;
                        const errs = Array.isArray(rawErrs)
                            ? rawErrs.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
                            : [];
                        await sendLWBotMessage(
                            channel_id,
                            ["⚠️ シフト追加処理中にエラーが発生しました。", ...(errs[0] ? [`詳細: ${errs[0]}`] : [])].join("\n"),
                            accessToken
                        );
                    }
                }
            }

            // ===== 既存：RPAキュー投入（必要なときだけ） =====
            if (templateIdForRPA && requestDetailForRPA) {
                const lw_user_id = logs.find((l) => l.id === ids[0])?.user_id ?? null;
                const { data: user } = await supabase
                    .from("users")
                    .select("auth_user_id")
                    .eq("lw_userid", lw_user_id)
                    .maybeSingle();
                const requestorId = user?.auth_user_id ?? null;

                await supabase.from("rpa_command_requests").insert({
                    template_id: templateIdForRPA,
                    request_details: requestDetailForRPA,
                    requester_id: requestorId,
                    status: "approved",
                    requested_at: new Date().toISOString(),
                });
            }

            // 処理済みフラグ
            for (const id of ids) {
                const { error: updateErr } = await supabase.from("msg_lw_log").update({ status: 9 }).eq("id", id);
                if (updateErr) console.error(`❌ Update failed for id=${id} (status=3):`, updateErr.message);
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
            console.error("💥 JSON解析またはInsertエラー:", errorMsg);

            await supabase.from("msg_lw_analysis_log").insert({
                timestamp: new Date().toISOString(),
                channel_id: channel_id,
                text: "parse-failed: " + errorMsg,
                reason: "JSON parse or insert error",
            });

            for (const id of ids) {
                const { error: updateErr } = await supabase.from("msg_lw_log").update({ status: 9 }).eq("id", id);
                if (updateErr) console.error(`❌ Update failed for id=${id} (status=4):`, updateErr.message);
            }
        }
    }
};

export default analyzePendingTalksAndDispatch;
