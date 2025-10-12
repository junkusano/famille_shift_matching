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

// ====== 厳密型（deleteShifts/insertShifts が期待する型） ======
type DeletionDetail = { shift_date: string; shift_time: string };
type ShiftDeleteRequest = { group_account: string; deletions: DeletionDetail[] };

type AdditionDetail = { user_id: string; shift_date: string; shift_time: string; service_code?: string };
type ShiftAddRequest = { group_account: string; additions: AdditionDetail[] };

// ====== AI出力の“ゆるい”型（既存に合わせる） ======
type ShiftDeletionItem = { shift_date?: string; shift_time?: string };
type ShiftDeletionRequest = { group_account: string; deletions: ShiftDeletionItem[] };

type ShiftAdditionItem = { shift_date?: string; shift_time?: string; service_code?: string; user_id?: string };
type ShiftInsertionRequest = {
    group_account: string;
    requested_by_user_id?: string; // あれば user_id 補完に利用
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

// ---- あいまい時間表現 → 開始時刻ウィンドウ（開始基準） ----
const PART_OF_DAY_WINDOWS: Record<string, { from: string; to: string }> = {
    // ご要望：朝は 05:00～11:00（開始時刻がこの範囲に入る）
    "朝": { from: "05:00", to: "11:00" },
    "あさ": { from: "05:00", to: "11:00" },
    "午前": { from: "05:00", to: "12:00" },

    "昼": { from: "11:00", to: "15:00" },
    "ひる": { from: "11:00", to: "15:00" },

    "午後": { from: "12:00", to: "19:00" },
    "夕": { from: "15:00", to: "19:00" },
    "夕方": { from: "15:00", to: "19:00" },

    "夜": { from: "19:00", to: "24:00" },
    "よる": { from: "19:00", to: "24:00" },
    "深夜": { from: "00:00", to: "05:00" },
};
// 文字列 "8:00" / "08:00" / "800" → 分に変換
function timeToMinutes(label: string): number | null {
    const s = label.trim();
    const m1 = s.match(/^(\d{1,2}):?(\d{2})$/); // 8:00 / 800 / 08:00
    if (m1) {
        const h = parseInt(m1[1], 10);
        const m = parseInt(m1[2], 10);
        if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m;
        return null;
    }
    const m2 = s.match(/^(\d{1,2})$/); // "8" 単独は 8:00 扱い
    if (m2) {
        const h = parseInt(m2[1], 10);
        if (h >= 0 && h < 24) return h * 60;
    }
    return null;
}

function minutesToHHMM(mins: number): string {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, mins));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    return `${hh}:${mm}`;
}

// "8:00-9:00" / "8-9" / "8:00" → { start, end? }（分）
function parseTimeRange(label: string): { start: number; end?: number } | null {
    const t = label.replace(/\s/g, "");
    const m = t.match(/^([^-\uFF0D～〜]+)[-\uFF0D～〜]?(.+)?$/); // -, 全角-, 波線にも対応
    if (!m) return null;

    const sMin = timeToMinutes(m[1]);
    if (sMin == null) return null;

    if (m[2]) {
        const eMin = timeToMinutes(m[2]);
        if (eMin != null) return { start: sMin, end: eMin };
    }
    return { start: sMin }; // 単独時刻
}

function detectWindowLabel(text: string): { from: string; to: string } | null {
    const key = Object.keys(PART_OF_DAY_WINDOWS).find((k) => text.includes(k));
    return key ? PART_OF_DAY_WINDOWS[key] : null;
}

function hhmm(t: string | null | undefined): string {
    if (!t) return "";
    // t が "08:30:00" 形式の場合に先頭5文字を使う
    return t.slice(0, 5);
}

// ゆるい → 厳密 変換（追加）
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

        if (!user_id) return { error: "user_id が不足しています（追加の割当先）" };
        if (!shift_date || !shift_time) return { error: "shift_date/shift_time が不足しています（追加）" };

        additions.push({
            user_id,
            shift_date,
            shift_time,
            service_code: a.service_code ?? undefined,
        });
    }
    return { group_account: req.group_account, additions };
}

// ---- type guard（any不使用）----
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

// ---- 追加：あいまい語が来たら、その日に該当する開始時刻のシフトをDBから列挙して置換する ----
// ---- 置換版：あいまい語 or 近傍(±45分) でDB実時刻に展開してから削除 ----
async function expandDeletionsByWindow(
    group_account: string,
    items: ShiftDeletionItem[]
): Promise<DeletionDetail[]> {
    const out: DeletionDetail[] = [];

    for (const d of items) {
        const date = (d.shift_date ?? "").trim();
        const timeText = (d.shift_time ?? "").trim();
        if (!date || !timeText) continue;

        // 1) 「朝/午前/…」などのラベル → ウィンドウで開始時刻マッチ
        const win = detectWindowLabel(timeText);
        if (win) {
            const { data, error } = await supabase
                .from("shift")
                .select("shift_start_time, shift_end_time")
                .eq("kaipoke_cs_id", group_account)
                .eq("shift_start_date", date)
                .gte("shift_start_time", win.from)
                .lt("shift_start_time", win.to);

            if (error || !data || data.length === 0) {
                // 見つからなければ、とりあえず元テキストで1件置いておく（後段のメッセージ整合用）
                out.push({ shift_date: date, shift_time: timeText });
            } else {
                for (const row of data as { shift_start_time: string; shift_end_time: string | null }[]) {
                    const st = hhmm(row.shift_start_time);
                    const et = hhmm(row.shift_end_time ?? "");
                    out.push({ shift_date: date, shift_time: et ? `${st}-${et}` : st });
                }
            }
            continue;
        }

        // 2) 具体時刻が来たがズレるケース → 開始時刻±45分の“近傍検索”
        const pr = parseTimeRange(timeText);
        if (pr && typeof pr.start === "number") {
            const fromHHMM = minutesToHHMM(pr.start - 45);
            const toHHMM = minutesToHHMM(pr.start + 45);

            const { data, error } = await supabase
                .from("shift")
                .select("shift_start_time, shift_end_time")
                .eq("kaipoke_cs_id", group_account)
                .eq("shift_start_date", date)
                .gte("shift_start_time", fromHHMM)
                .lt("shift_start_time", toHHMM);

            if (!error && data && data.length > 0) {
                for (const row of data as { shift_start_time: string; shift_end_time: string | null }[]) {
                    const st = hhmm(row.shift_start_time);
                    const et = hhmm(row.shift_end_time ?? "");
                    out.push({ shift_date: date, shift_time: et ? `${st}-${et}` : st });
                }
                continue;
            }
            // 近傍でも見つからなければ元の文言で1件残す
            out.push({ shift_date: date, shift_time: timeText });
            continue;
        }

        // 3) どれにも当てはまらない場合は素通し
        out.push({ shift_date: date, shift_time: timeText });
    }

    return out;
}


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

        // Works API token（メンバー参照＆返信にも再利用）
        const accessToken = await getAccessToken();

        // メンバー取得（@メンション→user_id解決に使用）
        const groupRes = await fetch(`https://www.worksapis.com/v1.0/groups/${channel_id}/members`, {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        });
        const groupData = (await groupRes.json()) as { members?: GroupMember[] };
        const members: GroupMember[] = groupData.members ?? [];

        const mentionMap = members
            .filter((m): m is GroupMember => m.type === "USER")
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

            // RPA登録用に汎用保持（後段の共通処理で使う）
            let templateIdForRPA: string | null = null;
            let requestDetailForRPA: unknown = null;

            // === シフト削除（DB直接削除 + あいまい語展開） ===
            if (isDeletePayload(parsedUnknown)) {
                const { request_detail } = parsedUnknown; // ShiftDeletionRequest
                templateIdForRPA = parsedUnknown.template_id;
                requestDetailForRPA = request_detail;

                console.log("🚀 シフト削除リクエストを検知。shiftテーブルから直接削除を試行します。");

                // ★ ここが今回の追加：あいまい語を時間帯に展開し、該当シフト時刻を列挙してから実行
                const expanded: DeletionDetail[] = await expandDeletionsByWindow(
                    request_detail.group_account,
                    request_detail.deletions
                );
                const delReqStrict: ShiftDeleteRequest = { group_account: request_detail.group_account, deletions: expanded };

                if (delReqStrict.deletions.length === 0) {
                    // 早期エラー（必要情報不足）
                    const lines = [
                        "⚠️ シフト削除できませんでした（必須情報が不足しています）。",
                        `・利用者: ${request_detail.group_account ?? "不明"}`,
                        "例）「10/13 08:00 のシフトを削除」 のように日時を一緒に送ってください。",
                    ];
                    await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                } else {
                    const deleteResult = await deleteShifts(delReqStrict);

                    const rawErrs =
                        deleteResult && typeof deleteResult === "object" && "errors" in deleteResult
                            ? (deleteResult as { errors?: unknown }).errors
                            : undefined;
                    const errs = Array.isArray(rawErrs)
                        ? rawErrs.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
                        : [];

                    const ok =
                        deleteResult &&
                        typeof deleteResult === "object" &&
                        "success" in deleteResult &&
                        (deleteResult as { success: boolean }).success;

                    if (ok) {
                        // 成功：元チャンネルへ通知（展開後の実時刻で表示）
                        const ga = request_detail.group_account ?? group_account;
                        const lines: string[] = ["✅ シフト削除を反映しました。"];
                        for (const d of delReqStrict.deletions) {
                            lines.push(`・利用者: ${ga} / 日付: ${d.shift_date} / 時間: ${d.shift_time}`);
                        }
                        lines.push("", "※ カイポケ側の反映には時間がかかる場合があります。");
                        await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                    } else {
                        // 失敗：既存方針のメッセージ
                        const ga = request_detail.group_account ?? group_account;
                        const isMissing = errs.some((e) => e.includes("必須情報不足"));
                        const isNotFound = errs.some((e) => e.includes("見つかりません") || e.toLowerCase().includes("not found"));

                        let header = "⚠️ シフト削除に失敗しました。";
                        if (isMissing) header = "⚠️ シフト削除できませんでした（必須情報が不足しています）。";
                        else if (isNotFound) header = "⚠️ シフト削除警告: 対象シフトが見つかりませんでした。";

                        const lines: string[] = [header];
                        // もとの入力ではなく、実行に使った expanded を表示
                        for (const d of delReqStrict.deletions) {
                            lines.push(`・利用者: ${ga} / 日付: ${d.shift_date} / 時間: ${d.shift_time}`);
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
            }

            // === シフト追加（DB直接挿入、既存ロジック） ===
            if (isInsertPayload(parsedUnknown)) {
                const { request_detail } = parsedUnknown; // ShiftInsertionRequest
                templateIdForRPA = parsedUnknown.template_id;
                requestDetailForRPA = request_detail;

                console.log("🚀 シフト追加リクエストを検知。shiftテーブルに直接挿入を試行します。");

                const addReqConv = toStrictAdd(request_detail);
                if (!("error" in addReqConv)) {
                    const insertResult = await insertShifts(addReqConv);

                    const ok =
                        insertResult &&
                        typeof insertResult === "object" &&
                        "success" in insertResult &&
                        (insertResult as { success: boolean }).success;

                    if (ok) {
                        const additions: ShiftAdditionItem[] =
                            (Array.isArray(request_detail.insertions) && request_detail.insertions) ||
                            (Array.isArray(request_detail.additions) && request_detail.additions) ||
                            (Array.isArray(request_detail.shifts) && request_detail.shifts) ||
                            [];
                        const ga = request_detail.group_account ?? group_account;

                        const lines: string[] = ["✅ シフト追加を登録しました。"];
                        for (const a of additions) {
                            const svc = a.service_code ? ` / 種別:${a.service_code}` : "";
                            lines.push(`・利用者: ${ga} / 日付: ${a.shift_date ?? "不明"} / 時間: ${a.shift_time ?? "不明"}${svc}`);
                        }
                        lines.push("", "※ カイポケ側の反映には時間がかかる場合があります。");

                        await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                    } else {
                        const rawErrs =
                            insertResult && typeof insertResult === "object" && "errors" in insertResult
                                ? (insertResult as { errors?: unknown }).errors
                                : undefined;
                        const errs = Array.isArray(rawErrs)
                            ? rawErrs.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
                            : [];
                        console.error("⚠️ シフト追加処理中にエラーが発生しました:", errs);
                    }
                } else {
                    // バリデーションNG
                    const lines = [
                        "⚠️ シフト追加できませんでした（必須情報が不足しています）。",
                        `・理由: ${addReqConv.error}`,
                    ];
                    await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
                }
            }

            // === 既存：RPAリクエストをキューへ ===
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
