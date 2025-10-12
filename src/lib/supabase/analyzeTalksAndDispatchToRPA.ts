// src/lib/supabase/analyzeTalksAndDispatchToRPA.ts
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import { rpaInstructionPrompt } from "@/lib/supabase/rpaInstructionPrompt";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { insertShifts } from "@/lib/supabase/shiftAdd";
import { deleteShifts } from "@/lib/supabase/shiftDelete";

// ====== 既存の型 ======
type GroupedTalk = {
    ids: number[];
    talks: { role: "user" | "assistant" | "system"; content: string }[];
};

type GroupMember = {
    externalKey: string;
    id: string;
    type: "USER" | "ORGUNIT" | "GROUP";
};

// ====== 厳密型（shiftAdd / shiftDelete が受け取る型）======
type DeletionDetail = { shift_date: string; shift_time: string };
type ShiftDeleteRequest = { group_account: string; deletions: DeletionDetail[] };

type AdditionDetail = {
    user_id: string;
    shift_date: string;
    shift_time: string; // "HH:MM" or "HH:MM-HH:MM"
    service_code?: string;
};
type ShiftAddRequest = { group_account: string; additions: AdditionDetail[] };

// ====== AI出力など“ゆるい入力型” ======
type ShiftDeletionItem = { shift_date?: string; shift_time?: string };
type ShiftDeletionRequest = { group_account: string; deletions: ShiftDeletionItem[] };

type ShiftAdditionItem = {
    shift_date?: string;
    shift_time?: string;       // あいまい語（"朝" など）や空の可能性あり
    service_code?: string;
    user_id?: string;          // 明示されないことがある
};
type ShiftInsertionRequest = {
    group_account: string;
    requested_by_user_id?: string; // 既定では依頼者を担当に
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

// ====== 既存 strict 変換 ======
function toStrictAdd(
    req: ShiftInsertionRequest
): ShiftAddRequest | { error: string } {
    const src: ShiftAdditionItem[] =
        (Array.isArray(req.insertions) && req.insertions) ||
        (Array.isArray(req.additions) && req.additions) ||
        (Array.isArray(req.shifts) && req.shifts) ||
        [];

    const additions: AdditionDetail[] = [];
    for (const a of src) {
        const shift_date = (a.shift_date ?? "").trim();
        const shift_time = (a.shift_time ?? "").trim();
        const user_id = (a.user_id ?? req.requested_by_user_id ?? "").trim();
        if (!user_id) return { error: "user_id が不足しています（追加の割当先）" };
        if (!shift_date || !shift_time)
            return { error: "shift_date/shift_time が不足しています（追加）" };

        additions.push({
            user_id,
            shift_date,
            shift_time,
            service_code: a.service_code ?? undefined,
        });
    }
    return { group_account: req.group_account, additions };
}



// ====== 追加: あいまい判定 & 近傍検索用ヘルパ ======
type TimeHint = "morning" | "noon" | "evening" | "night" | "deep" | null;

// 既存: parseTimeHint / hintWindow / tToMinutes / minutesToHHMM がある前提でOK
type ShiftRowLite = {
    shift_start_time: string | null;
    shift_end_time: string | null;
};

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

async function resolveDeletionTimes(
    req: ShiftDeletionRequest
): Promise<ShiftDeleteRequest> {
    const out: DeletionDetail[] = [];

    for (const item of req.deletions ?? []) {
        const date = (item.shift_date ?? "").trim();
        const rawTime = (item.shift_time ?? "").trim();
        if (!date || !rawTime) continue;

        // その日の候補を取得
        const { data } = await supabase
            .from("shift")
            .select("shift_start_time, shift_end_time")
            .eq("kaipoke_cs_id", req.group_account)
            .eq("shift_start_date", date)
            .order("shift_start_time", { ascending: true });

        const rows: ShiftRowLite[] = (data ?? []) as ShiftRowLite[];
        if (rows.length === 0) {
            // 候補なし → そのまま（deleteShifts 側で失敗→警告返す）
            out.push({ shift_date: date, shift_time: rawTime });
            continue;
        }

        const hint = parseTimeHint(rawTime);
        let chosen: ShiftRowLite | null = null;

        if (hint) {
            // ヒント窓に入る開始のうち center に最も近い
            const w = hintWindow(hint);
            if (w) {
                const scored = rows
                    .map((r) => {
                        const st = (r.shift_start_time ?? "").slice(0, 5);
                        const m = tToMinutes(st);
                        return { r, m };
                    })
                    .filter((x) => x.m !== null) as { r: ShiftRowLite; m: number }[];
                const inWin = scored.filter((x) => x.m >= w.startMin && x.m < w.endMin);
                inWin.sort((a, b) => Math.abs(a.m - w.centerMin) - Math.abs(b.m - w.centerMin));
                chosen = inWin[0]?.r ?? null;
            }
        } else {
            // 明示時間（8:00-9:00 等）の “ゆる合せ”：開始±90分で最も近い
            const pr = parseRange(rawTime);
            if (pr) {
                const TOL = 90; // 分
                const scored = rows
                    .map((r) => {
                        const st = (r.shift_start_time ?? "").slice(0, 5);
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
            const st = (chosen.shift_start_time ?? "").slice(0, 5);
            const et = (chosen.shift_end_time ?? "").slice(0, 5);
            const time = et ? `${st}-${et}` : st;
            out.push({ shift_date: date, shift_time: time });
        } else {
            // マッチできなければそのまま投げる（従来と同じ挙動）
            out.push({ shift_date: date, shift_time: rawTime });
        }
    }

    return { group_account: req.group_account, deletions: out };
}

function parseTimeHint(input: string | undefined): TimeHint {
    if (!input) return null;
    const s = input.replace(/\s/g, "").toLowerCase();

    // 日本語/英語の代表的な語をざっくり拾う
    if (/(朝|モーニング|午前|am)/.test(s)) return "morning";
    if (/(昼|正午|ランチ|お昼)/.test(s)) return "noon";
    if (/(夕|夕方|夕刻|夕食|pm)/.test(s)) return "evening";
    if (/(夜|ナイト|夜間)/.test(s)) return "night";
    if (/(深夜|未明)/.test(s)) return "deep";

    // 完全に時間表記ならヒントなし
    if (/\d{1,2}:\d{2}(-\d{1,2}:\d{2})?$/.test(s)) return null;
    return null;
}

// ヒントごとの窓（開始時刻の範囲）※ユーザー要望：朝=05:00-11:00、16時は朝ヒットしない
function hintWindow(h: TimeHint): { startMin: number; endMin: number; centerMin: number } | null {
    switch (h) {
        case "deep": return { startMin: 0, endMin: 300, centerMin: 150 };  // 00:00-05:00
        case "morning": return { startMin: 300, endMin: 660, centerMin: 480 };  // 05:00-11:00
        case "noon": return { startMin: 660, endMin: 840, centerMin: 750 };  // 11:00-14:00
        case "evening": return { startMin: 960, endMin: 1140, centerMin: 1050 }; // 16:00-19:00
        case "night": return { startMin: 1140, endMin: 1440, centerMin: 1320 };// 19:00-24:00
        default: return null;
    }
}

function tToMinutes(t: string): number | null {
    // "HH:MM"
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

type ShiftRow = {
    shift_id: number;
    kaipoke_cs_id: string | null;
    shift_start_date: string | null; // YYYY-MM-DD
    shift_start_time: string | null; // HH:MM:SS?
    shift_end_time: string | null;   // HH:MM:SS?
    service_code: string | null;
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
};

// 近傍シフトを「前後5件」相当で取得するため、±14日で一括取得 → ローカルで前後を切り出し
async function fetchNeighborShifts(
    group_account: string,
    baseDate: string
): Promise<ShiftRow[]> {
    // ±14日の範囲
    const base = new Date(baseDate + "T12:00:00Z");
    const before = new Date(base);
    before.setUTCDate(before.getUTCDate() - 14);
    const after = new Date(base);
    after.setUTCDate(after.getUTCDate() + 14);

    const from = before.toISOString().slice(0, 10);
    const to = after.toISOString().slice(0, 10);

    const { data, error } = await supabase
        .from("shift")
        .select(
            "shift_id,kaipoke_cs_id,shift_start_date,shift_start_time,shift_end_time,service_code,staff_01_user_id,staff_02_user_id,staff_03_user_id"
        )
        .eq("kaipoke_cs_id", group_account)
        .gte("shift_start_date", from)
        .lte("shift_start_date", to)
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true });

    if (error || !data) return [];

    return (data as ShiftRow[]).filter(
        (r) => r.shift_start_date && r.shift_start_time
    );
}

function combineToUtc(r: ShiftRow): number {
    // その日の開始時刻を UTC として組み立て（比較用）
    const d = `${r.shift_start_date}T${(r.shift_start_time ?? "00:00").slice(0, 5)}:00Z`;
    return Date.parse(d);
}

// 直前の 1 件（基準日時より前で最も近い）
function pickLastBefore(neighbors: ShiftRow[], baseDate: string): ShiftRow | null {
    const baseMs = Date.parse(baseDate + "T12:00:00Z");
    const before = neighbors
        .filter((r) => combineToUtc(r) <= baseMs)
        .sort((a, b) => combineToUtc(b) - combineToUtc(a));
    return before[0] ?? null;
}

// 朝/夕などのヒントに合う開始時刻（範囲内かつ center に最も近いもの）を前後5件から選ぶ
function pickByHintFromAround(
    neighbors: ShiftRow[],
    baseDate: string,
    hint: TimeHint
): ShiftRow | null {
    const w = hintWindow(hint);
    if (!w) return null;

    // 前後5件相当：基準の前後に最も近い 10 件を抽出
    const baseMs = Date.parse(baseDate + "T12:00:00Z");
    const sortedByDist = neighbors
        .slice()
        .sort((a, b) => Math.abs(combineToUtc(a) - baseMs) - Math.abs(combineToUtc(b) - baseMs))
        .slice(0, 10);

    // 窓に入る開始のみに絞る
    const withStartMin = sortedByDist
        .map((r) => {
            const hhmm = (r.shift_start_time ?? "").slice(0, 5);
            const min = tToMinutes(hhmm);
            return { r, min };
        })
        .filter((x) => x.min !== null) as { r: ShiftRow; min: number }[];

    const inWindow = withStartMin.filter(
        (x) => x.min >= w.startMin && x.min < w.endMin
    );

    if (inWindow.length === 0) return null;

    // center に最も近い
    inWindow.sort((a, b) => Math.abs(a.min - w.centerMin) - Math.abs(b.min - w.centerMin));
    return inWindow[0]?.r ?? null;
}

function buildShiftTimeFromRef(ref: ShiftRow): string | null {
    const st = (ref.shift_start_time ?? "").slice(0, 5);
    const et = (ref.shift_end_time ?? "").slice(0, 5);
    if (!st) return null;
    return et ? `${st}-${et}` : st;
}

function pickStaffFromRef(ref: ShiftRow): string | null {
    return ref.staff_01_user_id ?? ref.staff_02_user_id ?? ref.staff_03_user_id ?? null;
}

// ====== 追加: strict NG 後の回復ロジック ======
async function recoverAdditionsFromNeighbors(
    req: ShiftInsertionRequest
): Promise<ShiftAddRequest | { error: string; detail?: string[] }> {
    const src: ShiftAdditionItem[] =
        (Array.isArray(req.insertions) && req.insertions) ||
        (Array.isArray(req.additions) && req.additions) ||
        (Array.isArray(req.shifts) && req.shifts) ||
        [];

    if (!req.group_account) {
        return { error: "group_account が不足しています" };
    }

    const additions: AdditionDetail[] = [];
    const errors: string[] = [];

    for (const [idx, item] of src.entries()) {
        const date = (item.shift_date ?? "").trim();
        if (!date) {
            errors.push(`item#${idx + 1}: shift_date が不足`);
            continue;
        }

        const hint: TimeHint = parseTimeHint(item.shift_time);
        const neighbors = await fetchNeighborShifts(req.group_account, date);

        let ref: ShiftRow | null = null;

        if (!item.shift_time || (item.shift_time && hint === null && !/\d{1,2}:\d{2}/.test(item.shift_time))) {
            // ① 時間指定なし（"朝/夕" 等を含まない）→ 直前の 1 件をコピー
            ref = pickLastBefore(neighbors, date);
        } else {
            // ② "朝/夕" などのヒントあり → 前後5件から近似値
            const effectiveHint = hint ?? null;
            if (effectiveHint) {
                ref = pickByHintFromAround(neighbors, date, effectiveHint);
            } else {
                // 文字列が純粋な時間表記ではないがヒントにも該当しない → 最後の前件にフォールバック
                ref = pickLastBefore(neighbors, date);
            }
        }

        if (!ref) {
            // ④ 前後にサービスが一切ない → エラー
            errors.push(
                `item#${idx + 1}: 近傍に参照できるシフトがありません（${date} の前後）`
            );
            continue;
        }

        // 参照から時間とサービスコードを決定
        const refShiftTime = buildShiftTimeFromRef(ref);
        const shift_time = refShiftTime ?? ""; // null の場合は空→NG に
        const service_code = item.service_code ?? ref.service_code ?? undefined;

        // 担当者
        // ③ 指定がなければ参照シフトの担当者（staff_01→02→03）をコピー
        const user_id =
            (item.user_id ?? req.requested_by_user_id)?.trim() ||
            pickStaffFromRef(ref) ||
            "";

        if (!user_id) {
            errors.push(`item#${idx + 1}: user_id を特定できませんでした（メンション/依頼者/参照シフト担当のいずれも不明）`);
            continue;
        }
        if (!shift_time) {
            errors.push(`item#${idx + 1}: shift_time を特定できませんでした（参照から時間が取得できない）`);
            continue;
        }

        additions.push({
            user_id,
            shift_date: date,
            shift_time,
            service_code,
        });
    }

    if (additions.length === 0) {
        return { error: "すべてのアイテムで回復に失敗しました", detail: errors };
    }
    return { group_account: req.group_account, additions };
}

// ====== type guard（any不使用）======
function isDeletePayload(x: unknown): x is DeletePayload {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    if (o.template_id !== "9bcfa71a-e800-4b49-a6aa-b80016b4b683") return false;
    const d = o.request_detail;
    if (!d || typeof d !== "object") return false;
    const r = d as Record<string, unknown>;
    if (typeof r.group_account !== "string") return false;
    return Array.isArray(r.deletions);
}
function isInsertPayload(x: unknown): x is InsertPayload {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    if (o.template_id !== "2f9dacc7-92bc-4888-8ff3-eadca4e4f75a") return false;
    const d = o.request_detail;
    if (!d || typeof d !== "object") return false;
    const r = d as Record<string, unknown>;
    if (typeof r.group_account !== "string") return false;
    return Array.isArray(r.insertions) || Array.isArray(r.additions) || Array.isArray(r.shifts);
}

// ====== 本体 ======
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

            const parsedUnknown = JSON.parse(cleanedText) as unknown;

            // RPA登録用に汎用保持（後段で共通処理）
            let templateIdForRPA: string | null = null;
            let requestDetailForRPA: unknown = null;

            // === 削除 ===
            if (isDeletePayload(parsedUnknown)) {
                const { request_detail } = parsedUnknown;
                templateIdForRPA = parsedUnknown.template_id;
                requestDetailForRPA = request_detail;

                console.log("🚀 シフト削除リクエストを検知。shiftテーブルから直接削除を試行します。");

                // 🔁 ここを “toStrictDelete” ではなく、まず “resolveDeletionTimes” に戻す
                const delReqResolved = await resolveDeletionTimes(request_detail);
                const delResult = await deleteShifts(delReqResolved);

                // （以下の成功/失敗メッセージ出力ロジックはそのまま流用）
                const rawErrs =
                    delResult && typeof delResult === "object" && "errors" in delResult
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
                    for (const d of delReqResolved.deletions) {
                        lines.push(`・利用者: ${delReqResolved.group_account} / 日付: ${d.shift_date} / 時間: ${d.shift_time}`);
                    }
                    lines.push("", "※ カイポケ側の反映には時間がかかる場合があります。");
                    await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                } else {
                    const isMissing = errs.some((e) => e.includes("必須情報不足"));
                    const isNotFound = errs.some((e) => e.includes("見つかりません") || e.toLowerCase().includes("not found"));
                    let header = "⚠️ シフト削除に失敗しました。";
                    if (isMissing) header = "⚠️ シフト削除できませんでした（必須情報が不足しています）。";
                    else if (isNotFound) header = "⚠️ シフト削除警告: 対象シフトが見つかりませんでした。";

                    const lines: string[] = [header];
                    for (const d of delReqResolved.deletions) {
                        lines.push(`・利用者: ${delReqResolved.group_account} / 日付: ${d.shift_date} / 時間: ${d.shift_time}`);
                    }
                    if (isMissing) {
                        lines.push("", "例）「10/13 08:00 のシフトを削除」 のように日時を一緒に送ってください。");
                    } else if (isNotFound) {
                        lines.push("", "候補：時間の表記ゆれ（例: 08:00 / 8:00 / 8:00-9:00）や別日の同名案件が無いかをご確認ください。");
                    }
                    if (errs.length > 0) lines.push("", `詳細: ${errs[0]}`);
                    await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                }
            }

            // === 追加 ===
            if (isInsertPayload(parsedUnknown)) {
                const { request_detail } = parsedUnknown;
                templateIdForRPA = parsedUnknown.template_id;
                requestDetailForRPA = request_detail;

                console.log("🚀 シフト追加リクエストを検知。shiftテーブルに直接挿入を試行します。");

                // まず厳密チェック
                const addReqConv = toStrictAdd(request_detail);
                let addReqFinal: ShiftAddRequest | null = null;
                let usedFallback = false;

                if ("error" in addReqConv) {
                    // ★ ここからが“回復ロジック”（ユーザー要望 ①②③④）
                    usedFallback = true;
                    const recovered = await recoverAdditionsFromNeighbors(request_detail);
                    if ("error" in recovered) {
                        // 回復も不可 → エラーメッセージを返し、LWへ通知
                        const lines: string[] = [
                            "⚠️ シフト追加できませんでした（必須情報不足または近傍に参照なし）。",
                            `・理由: ${recovered.error}`,
                        ];
                        if (Array.isArray(recovered.detail) && recovered.detail.length > 0) {
                            lines.push("", ...recovered.detail.map((d) => `- ${d}`));
                        }
                        await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                        // 既存フローは壊さず終了
                        addReqFinal = null;
                    } else {
                        addReqFinal = recovered;
                    }
                } else {
                    addReqFinal = addReqConv;
                }

                if (addReqFinal) {
                    const insertResult = await insertShifts(addReqFinal);

                    const ok =
                        insertResult &&
                        typeof insertResult === "object" &&
                        "success" in insertResult &&
                        Boolean((insertResult as { success?: boolean }).success);

                    if (ok) {
                        // ⑤ 成功通知（日時・サービスコード・スタッフ）
                        const lines: string[] = [
                            usedFallback ? "✅ シフト追加を登録しました（参照シフトから補完）。" : "✅ シフト追加を登録しました。"
                        ];
                        for (const a of addReqFinal.additions) {
                            const svc = a.service_code ? ` / 種別:${a.service_code}` : "";
                            lines.push(`・利用者: ${addReqFinal.group_account} / 日付: ${a.shift_date} / 時間: ${a.shift_time}${svc} / スタッフ:${a.user_id}`);
                        }
                        lines.push("", "※ カイポケ側の反映には時間がかかる場合があります。");
                        await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                    } else {
                        const rawErrs =
                            insertResult && typeof insertResult === "object" && "errors" in insertResult
                                ? (insertResult as { errors?: unknown }).errors
                                : undefined;
                        const errs: string[] = Array.isArray(rawErrs)
                            ? rawErrs.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
                            : [];
                        const lines: string[] = [
                            "⚠️ シフト追加処理中にエラーが発生しました。",
                            ...(errs.length > 0 ? [`詳細: ${errs[0]}`] : []),
                        ];
                        await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                    }
                }
            }

            // === 既存：RPA キュー投入（成功/失敗に関わらず元の形で積む） ===
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

            // === 既存：処理済みフラグ ===
            for (const id of ids) {
                const { error: updateErr } = await supabase.from("msg_lw_log").update({ status: 9 }).eq("id", id);
                if (updateErr) console.error(`❌ Update failed for id=${id} (status=3):`, updateErr.message);
            }
        } catch (err: unknown) {
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
