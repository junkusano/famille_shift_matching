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

// ====== 厳密型（shiftDelete/shiftAdd が期待） ======
type DeletionDetail = { shift_date: string; shift_time: string };
type ShiftDeleteRequest = { group_account: string; deletions: DeletionDetail[] };

type AdditionDetail = { user_id: string; shift_date: string; shift_time: string; service_code?: string };
type ShiftAddRequest = { group_account: string; additions: AdditionDetail[] };

// ====== AI出力（ゆるい入力型） ======
type ShiftDeletionItem = { shift_date?: string; shift_time?: string };
type ShiftDeletionRequest = { group_account: string; deletions: ShiftDeletionItem[] };

type ShiftAdditionItem = { shift_date?: string; shift_time?: string; service_code?: string; user_id?: string };
type ShiftInsertionRequest = {
    group_account: string;
    requested_by_user_id?: string; // あれば user_id の補完に使う
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

// ==== あいまい時間（朝/昼/夕…）を解決するための補助 ====

// 00:00〜23:59 の範囲で運用。必要に応じて調整してください。
const PART_OF_DAY_WINDOWS: Record<string, { from: string; to: string }> = {
    // 朝：5-11時
    "朝": { from: "05:00", to: "11:00" },
    "午前": { from: "00:00", to: "12:00" },
    // 昼：11-15時（正午〜午後前半）
    "昼": { from: "11:00", to: "15:00" },
    "正午": { from: "11:30", to: "13:30" },
    // 夕：15-19時（夕方）
    "夕": { from: "15:00", to: "19:00" },
    "夕方": { from: "15:00", to: "19:00" },
    // 追加でよくある言い回しも受けるなら↓
    "午後": { from: "12:00", to: "18:00" },
    "夜": { from: "19:00", to: "23:59" },
};

function detectFuzzyToken(s: string | undefined | null): keyof typeof PART_OF_DAY_WINDOWS | null {
    if (!s) return null;
    const keys = Object.keys(PART_OF_DAY_WINDOWS) as Array<keyof typeof PART_OF_DAY_WINDOWS>;
    const hit = keys.find(k => s.includes(k));
    return hit ?? null;
}

/**
 * 「朝/昼/夕」などのあいまい時刻を、当日の実シフト（DB）に展開して
 * deleteShifts が食べられる厳密な DeletionDetail[] に変換する
 */
async function expandFuzzyDeletions(
    reqLoose: ShiftDeletionRequest
): Promise<ShiftDeleteRequest> {
    const out: DeletionDetail[] = [];

    for (const d of reqLoose.deletions ?? []) {
        const shift_date = (d.shift_date ?? "").trim();
        const inputTime = (d.shift_time ?? "").trim();
        if (!shift_date) continue;

        const token = detectFuzzyToken(inputTime);
        if (!token) {
            // あいまい語じゃない → そのまま
            if (inputTime) out.push({ shift_date, shift_time: inputTime });
            continue;
        }

        // あいまい語 → 時間窓検索
        const win = PART_OF_DAY_WINDOWS[token];

        // 該当日の、時間窓に入るシフトを取得して展開
        const { data, error } = await supabase
            .from("shift")
            .select("shift_start_time, shift_end_time")
            .eq("kaipoke_cs_id", reqLoose.group_account)
            .eq("shift_start_date", shift_date)
            .gte("shift_start_time", win.from)
            .lt("shift_start_time", win.to);

        if (error) {
            console.error("[expandFuzzyDeletions] query error:", error.message);
            // 失敗しても元の指定を残しておく（deleteShifts 側で not found になる想定）
            if (inputTime) out.push({ shift_date, shift_time: inputTime });
            continue;
        }

        if (!data || data.length === 0) {
            // 見つからない場合は元の指定のまま（後段で「見つかりません」を返す）
            if (inputTime) out.push({ shift_date, shift_time: inputTime });
            continue;
        }

        // 見つかったシフトを個別に削除対象へ展開
        for (const row of data as Array<{ shift_start_time: string; shift_end_time: string | null }>) {
            const start = row.shift_start_time ?? "";
            const end = row.shift_end_time ?? "不明";
            if (!start) continue;
            out.push({ shift_date, shift_time: `${start}-${end}` });
        }
    }

    if (out.length === 0) {
        // 何も作れなかった場合は（安全に）従来どおりの厳密化で返す
        return toStrictDelete(reqLoose);
    }
    return { group_account: reqLoose.group_account, deletions: out };
}


// ====== ゆるい → 厳密 変換 ======
function toStrictDelete(req: ShiftDeletionRequest): ShiftDeleteRequest {
    const deletions: DeletionDetail[] = (req.deletions ?? [])
        .map((d) => ({
            shift_date: (d.shift_date ?? "").trim(),
            shift_time: (d.shift_time ?? "").trim(),
        }))
        .filter((d) => d.shift_date && d.shift_time);
    return { group_account: req.group_account, deletions };
}

function toStrictAdd(req: ShiftInsertionRequest): ShiftAddRequest | { error: string } {
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

// ====== type guard（any 不使用）======
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

// ====== 返信（LW）共通 ======
async function notifyLW(channelId: string, message: string): Promise<void> {
    try {
        const token = await getAccessToken();
        await sendLWBotMessage(channelId, message, token);
    } catch {
        // ログ通知失敗は握りつぶす
    }
}

// ====== メイン実行関数（cron から呼び出し）======
async function analyzePendingTalksAndDispatch(): Promise<void> {
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

            const parsedUnknown = JSON.parse(cleanedText) as unknown;

            // RPA 登録用に保持（最後に共通でキューへ）
            let templateIdForRPA: string | null = null;
            let requestDetailForRPA: unknown = null;

            // === シフト削除（まず DB 直接削除し、結果をLWへ返す） ===
            if (isDeletePayload(parsedUnknown)) {
                const { request_detail } = parsedUnknown;
                templateIdForRPA = parsedUnknown.template_id;
                requestDetailForRPA = request_detail;

                console.log("🚀 シフト削除リクエストを検知。shiftテーブルから直接削除を試行します。");

                const delReqStrict = await expandFuzzyDeletions(request_detail);
                const delResult = await deleteShifts(delReqStrict);

                const rawErrs =
                    delResult && typeof delResult === "object" && "errors" in delResult
                        ? (delResult as { errors?: unknown }).errors
                        : undefined;
                const errs = Array.isArray(rawErrs)
                    ? rawErrs.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
                    : [];

                const ok =
                    delResult &&
                    typeof delResult === "object" &&
                    "success" in delResult &&
                    Boolean((delResult as { success?: boolean }).success);

                if (ok) {
                    const ga = request_detail.group_account ?? group_account;
                    const lines: string[] = ["✅ シフト削除を反映しました。"];
                    for (const d of delReqStrict.deletions) {
                        lines.push(`・利用者: ${ga} / 日付: ${d.shift_date} / 時間: ${d.shift_time}`);
                    }
                    lines.push("", "※ カイポケ側の反映には時間がかかる場合があります。");
                    await notifyLW(channel_id, lines.join("\n"));
                } else {
                    console.error("⚠️ シフト削除処理中にエラーが発生しました:", errs);

                    const ga = request_detail.group_account ?? group_account;
                    const isMissing = errs.some((e) => e.includes("必須情報不足"));
                    const isNotFound = errs.some((e) => e.includes("見つかりません") || e.toLowerCase().includes("not found"));

                    let header = "⚠️ シフト削除に失敗しました。";
                    if (isMissing) header = "⚠️ シフト削除できませんでした（必須情報が不足しています）。";
                    else if (isNotFound) header = "⚠️ シフト削除警告: 対象シフトが見つかりませんでした。";

                    const lines: string[] = [header];
                    for (const d of delReqStrict.deletions) {
                        lines.push(`・利用者: ${ga} / 日付: ${d.shift_date} / 時間: ${d.shift_time}`);
                    }
                    if (isMissing) {
                        lines.push("", "例）「10/13 08:00 のシフトを削除」 のように日時を一緒に送ってください。");
                    } else if (isNotFound) {
                        lines.push("", "候補：時間の表記ゆれ（例: 08:00 / 8:00 / 8:00-9:00）や別日の同名案件が無いかをご確認ください。");
                    }
                    if (errs.length > 0) lines.push("", `詳細: ${errs[0]}`);

                    await notifyLW(channel_id, lines.join("\n"));
                }
            }

            // === シフト追加（まず DB 直接挿入し、結果をLWへ返す） ===
            if (isInsertPayload(parsedUnknown)) {
                const { request_detail } = parsedUnknown;
                templateIdForRPA = parsedUnknown.template_id;
                requestDetailForRPA = request_detail;

                console.log("🚀 シフト追加リクエストを検知。shiftテーブルに直接挿入を試行します。");

                const addReqConv = toStrictAdd(request_detail);
                if ("error" in addReqConv) {
                    await notifyLW(
                        channel_id,
                        ["⚠️ シフト追加できませんでした（必須情報が不足しています）。", `・理由: ${addReqConv.error}`].join("\n")
                    );
                } else {
                    const addResult = await insertShifts(addReqConv);

                    const ok =
                        addResult &&
                        typeof addResult === "object" &&
                        "success" in addResult &&
                        Boolean((addResult as { success?: boolean }).success);

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

                        await notifyLW(channel_id, lines.join("\n"));
                    } else {
                        const rawErrs =
                            addResult && typeof addResult === "object" && "errors" in addResult
                                ? (addResult as { errors?: unknown }).errors
                                : undefined;
                        const errs = Array.isArray(rawErrs)
                            ? rawErrs.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
                            : [];
                        console.error("⚠️ シフト追加処理中にエラーが発生しました:", errs);

                        await notifyLW(
                            channel_id,
                            ["⚠️ シフト追加処理中にエラーが発生しました。", ...(errs.length > 0 ? [`詳細: ${errs[0]}`] : [])].join(
                                "\n"
                            )
                        );
                    }
                }
            }

            // === 共通：RPA キューへ（元の仕様を維持） ===
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

            // === 処理済みフラグ ===
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
}

export default analyzePendingTalksAndDispatch;
