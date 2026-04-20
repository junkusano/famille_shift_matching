//api/dialogflow/webhook/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type PendingRow = {
    id: string;
    session_key: string;
    channel_id: string;
    requester_lw_userid: string | null;
    requester_user_id: string | null;
    target_kaipoke_cs_id: string | null;
    target_shift_id: number | null;
    intent_name: string | null;
    status: string;

    shift_date: string | null;
    start_time: string | null;
    end_time: string | null;
    service_code: string | null;

    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
    staff_02_attend_flg: boolean | null;
    staff_03_attend_flg: boolean | null;

    required_staff_count: number | null;
    two_person_work_flg: boolean | null;

    support_type: string | null; // two_person_care / accompany
    is_judo_ido: boolean | null;
    judo_ido: string | null; // "0130" など
    staff_02_role: string | null; // second_caregiver / companion
    staff_03_role: string | null;

    source_message: string | null;
    last_message: string | null;
    confirm_summary: string | null;
    inferred_service_code: string | null;
    inferred_service_reason: string | null;
    mentioned_lw_userids: string[] | null;
    raw_event: unknown;
    raw_dialogflow: unknown;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
};

type ResolvedStaff = {
    requesterUserId: string | null;
    mentionResolvedUserIds: string[];
    mentionPrimaryUserId: string | null;
    staffNameResolvedUserId: string | null;
};

type DialogflowParams = Record<string, unknown>;

type ResolvedTarget =
    | {
        kind: "client";
        kaipoke_cs_id: string;
        client_name: string | null;
        group_account: string;
    }
    | {
        kind: "staff";
        kaipoke_cs_id: null;
        client_name: null;
        group_account: string;
    }
    | null;

type ShiftRow = {
    shift_id: number;
    kaipoke_cs_id: string | null;
    shift_start_date: string | null;
    shift_start_time: string | null;
    shift_end_date: string | null;
    shift_end_time: string | null;
    service_code: string | null;
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
    staff_02_attend_flg: boolean | null;
    staff_03_attend_flg: boolean | null;
    required_staff_count: number | null;
    two_person_work_flg: boolean | null;
    staff_01_role_code: string | null;
    staff_02_role_code: string | null;
    staff_03_role_code: string | null;
    judo_ido: string | null;
};


type ServiceCodeCandidate = {
    service_code: string;
    plan_display_name: string | null;
    plan_service_category: string | null;
    score: number;
};

type StaffDisplayRow = {
    user_id: string;
    lw_userid: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
};

type InitialOperationDecision = {
    operation: "create_shift" | "delete_shift" | "update_shift" | "staff_unavailable" | "unknown";
    reason: string;
};

async function classifyInitialOperationWithOpenAI(message: string): Promise<InitialOperationDecision | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const prompt = `
次の日本語メッセージを、訪問介護シフト操作の初回意図に分類してください。
返答はJSONのみ。
許可される operation は:
- create_shift
- delete_shift
- update_shift
- staff_unavailable
- unknown

例:
"4/21 18:15~ サービスキャンセルになりました" => delete_shift
"4/22 7:30-13:30 同行援護あります" => create_shift
"担当者は私です" => unknown（初回なら）
"自分は行けません" => staff_unavailable

message:
${message}
`.trim();

    const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-5.4",
            input: [
                {
                    role: "system",
                    content: [
                        {
                            type: "input_text",
                            text: "あなたは訪問介護のシフト操作分類器です。"
                        }
                    ]
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text: prompt
                        }
                    ]
                }
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "initial_operation_decision",
                    schema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            operation: {
                                type: "string",
                                enum: [
                                    "create_shift",
                                    "delete_shift",
                                    "update_shift",
                                    "staff_unavailable",
                                    "unknown"
                                ]
                            },
                            reason: {
                                type: "string"
                            }
                        },
                        required: ["operation", "reason"]
                    }
                }
            }
        }),
    });

    if (!res.ok) {
        console.error("[dialogflow webhook] openai classify failed", await res.text());
        return null;
    }

    const json = await res.json() as Record<string, unknown>;
    const outputText =
        Array.isArray(json.output)
            ? JSON.stringify(json.output)
            : normalizeString((json as Record<string, unknown>).output_text);

    if (!outputText) return null;

    const text =
        normalizeString((json as Record<string, unknown>).output_text) ??
        "";

    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        const operation = normalizeString(parsed.operation) as InitialOperationDecision["operation"] | null;
        const reason = normalizeString(parsed.reason) ?? "OpenAI classification";
        if (!operation) return null;
        return {
            operation,
            reason,
        };
    } catch (e) {
        console.error("[dialogflow webhook] openai classify parse error", e, text);
        return null;
    }
}

const SESSION_TTL_MS = 7 * 60 * 1000;

const FINALIZATION_INTENTS = new Set([
    "confirm_yes",
    "confirm_no",
]);

const CREATE_FOLLOWUP_INTENTS = new Set([
    "correct_staff",
    "correct_time",
    "correct_service_code",
    "set_second_staff",
    "set_third_staff",
    "set_support_structure",
]);

function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= Date.now();
}

function isTopLevelOperationIntent(intentName: string | null): boolean {
    return (
        intentName === "create_shift" ||
        intentName === "delete_shift" ||
        intentName === "update_shift" ||
        intentName === "staff_unavailable"
    );
}

function isAllowedInitialIntent(intentName: string | null): boolean {
    return (
        isTopLevelOperationIntent(intentName) ||
        intentName === "delete_shift_date_ready" ||
        intentName === "create_shift_missing_ready"
    );
}

function mapDialogflowIntentToInitialOperation(intentName: string | null): string | null {
    if (!intentName) return null;

    if (intentName === "create_shift_missing_ready") return "create_shift";

    // delete は date_ready をそのまま初回有効intentとして扱う
    if (intentName === "delete_shift_date_ready") return "delete_shift_date_ready";

    if (isTopLevelOperationIntent(intentName)) return intentName;

    return null;
}

function isAllowedFollowupForLockedOperation(
    lockedOperation: string | null,
    incomingIntent: string | null
): boolean {
    if (!incomingIntent) return false;
    if (FINALIZATION_INTENTS.has(incomingIntent)) return true;

    if (lockedOperation === "create_shift") {
        return CREATE_FOLLOWUP_INTENTS.has(incomingIntent);
    }

    return false;
}

function jsonText(
    text: string,
    extraSessionParams?: Record<string, unknown>,
    agentType: "create" | "delete" | "update" | "common" = "common"
) {
    const prefix =
        agentType === "create"
            ? "（追加処理エージェント） "
            : agentType === "delete"
                ? "（削除処理エージェント） "
                : agentType === "update"
                    ? "（更新処理エージェント） "
                    : "（汎用エージェント） ";

    return NextResponse.json({
        fulfillment_response: {
            messages: [{ text: { text: [`${prefix}${text}`] } }],
        },
        ...(extraSessionParams
            ? {
                sessionInfo: {
                    parameters: extraSessionParams,
                },
            }
            : {}),
    });
}

function jsonNoReply(extraSessionParams?: Record<string, unknown>) {
    return NextResponse.json(
        extraSessionParams
            ? {
                sessionInfo: {
                    parameters: extraSessionParams,
                },
            }
            : {}
    );
}

function buildClearedSessionParams() {
    return {
        operation_type: null,
        shift_date: null,
        start_time: null,
        end_time: null,
        service_code: null,
        target_shift_id: null,
        confirm_summary: null,
        support_type: null,
        staff_position: null,
        is_judo_ido: null,
        judo_ido_time: null,
        awaiting_missing_fields: null,
        flow_stage: null,
        staff_name: null,
    };
}

function normalizeString(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (s === "null" || s === "undefined" || s === "不明") return null;
    return s;
}

function normalizeBoolean(v: unknown): boolean | null {
    if (typeof v === "boolean") return v;
    const s = normalizeString(v)?.toLowerCase();
    if (!s) return null;
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
    return null;
}

function messageImpliesCancellation(text: string | null): boolean {
    if (!text) return false;
    return /(キャンセル|中止|休み|取り消し|なしになりました|なくなりました)/.test(text);
}

function normalizeDate(v: unknown): string | null {
    if (v === null || v === undefined) return null;

    if (Array.isArray(v)) {
        return normalizeDate(v[0]);
    }

    if (typeof v === "object") {
        const obj = v as Record<string, unknown>;

        const year = Number(obj.year);
        const month = Number(obj.month);
        const day = Number(obj.day);

        if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
            return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
    }

    const s = normalizeString(v);
    if (!s) return null;

    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

function normalizeTime(v: unknown): string | null {
    if (v === null || v === undefined) return null;

    if (typeof v === "object") {
        const obj = v as Record<string, unknown>;

        const partial = obj.partial as Record<string, unknown> | undefined;
        const past = obj.past as Record<string, unknown> | undefined;
        const future = obj.future as Record<string, unknown> | undefined;

        const pick = (o?: Record<string, unknown>) => {
            if (!o) return null;
            const hh = Number(o.hours);
            const mm = Number(o.minutes);
            if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
                return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
            }
            return null;
        };

        // ★ 優先順位変更
        return (
            pick(partial) ??
            pick(past) ??
            pick(future) ??
            pick(obj) ??  // ← 最後に top
            null
        );
    }

    const s = normalizeString(v);
    if (!s) return null;

    const dt = s.match(/T(\d{2}:\d{2})/);
    if (dt) return dt[1];

    const t = s.match(/^(\d{1,2}):(\d{2})/);
    if (t) {
        const hh = String(Number(t[1])).padStart(2, "0");
        return `${hh}:${t[2]}`;
    }

    const compact = s.match(/^(\d{1,2})(\d{2})$/);
    if (compact) {
        const hh = String(Number(compact[1])).padStart(2, "0");
        return `${hh}:${compact[2]}`;
    }

    return null;
}

function normalizeTimeForCreate(v: unknown, sourceMessage: string | null): string | null {
    if (v === null || v === undefined) return null;

    if (typeof v === "object") {
        const obj = v as Record<string, unknown>;

        const topH = Number(obj.hours);
        const topM = Number(obj.minutes);

        const future = obj.future as Record<string, unknown> | undefined;
        const futureH = Number(future?.hours);
        const futureM = Number(future?.minutes);

        const past = obj.past as Record<string, unknown> | undefined;
        const pastH = Number(past?.hours);
        const pastM = Number(past?.minutes);

        const partial = obj.partial as Record<string, unknown> | undefined;
        const partialH = Number(partial?.hours);
        const partialM = Number(partial?.minutes);

        const topOk = !Number.isNaN(topH) && !Number.isNaN(topM);
        const futureOk = !Number.isNaN(futureH) && !Number.isNaN(futureM);
        const pastOk = !Number.isNaN(pastH) && !Number.isNaN(pastM);
        const partialOk = !Number.isNaN(partialH) && !Number.isNaN(partialM);

        if (hasMorningHint(sourceMessage)) {
            if (pastOk && pastH >= 0 && pastH < 12) {
                return `${String(pastH).padStart(2, "0")}:${String(pastM).padStart(2, "0")}`;
            }
            if (partialOk && partialH >= 0 && partialH < 12) {
                return `${String(partialH).padStart(2, "0")}:${String(partialM).padStart(2, "0")}`;
            }
            if (topOk && topH >= 0 && topH < 12) {
                return `${String(topH).padStart(2, "0")}:${String(topM).padStart(2, "0")}`;
            }
        }

        if (hasAfternoonHint(sourceMessage)) {
            if (futureOk) {
                const hh = futureH === 0 ? 12 : futureH;
                return `${String(hh).padStart(2, "0")}:${String(futureM).padStart(2, "0")}`;
            }
            if (topOk) {
                const hh = topH === 0 ? 12 : topH;
                return `${String(hh).padStart(2, "0")}:${String(topM).padStart(2, "0")}`;
            }
            if (pastOk) {
                const hh = pastH === 0 ? 12 : pastH;
                return `${String(hh).padStart(2, "0")}:${String(pastM).padStart(2, "0")}`;
            }
        }

        // 9:30 が 21:30 に倒れるケースを補正
        if (topOk && pastOk) {
            const diff = topH - pastH;
            if (diff === 12 && topH >= 12 && pastH >= 0 && pastH < 12) {
                return `${String(pastH).padStart(2, "0")}:${String(pastM).padStart(2, "0")}`;
            }
        }

        if (partialOk && pastOk) {
            const diff = partialH - pastH;
            if (diff === 12 && partialH >= 12 && pastH >= 0 && pastH < 12) {
                return `${String(pastH).padStart(2, "0")}:${String(pastM).padStart(2, "0")}`;
            }
        }
    }

    return normalizeTime(v);
}


function hhmmToCompact(v: string | null): string {
    if (!v) return "0000";
    return v.replace(":", "");
}

function compactToDisplayHHMM(v: string | null): string {
    if (!v || v === "0000") return "なし";
    if (/^\d{4}$/.test(v)) return `${v.slice(0, 2)}:${v.slice(2, 4)}`;
    if (/^\d{2}:\d{2}$/.test(v)) return v;
    return v;
}


function displayStaffName(row: StaffDisplayRow | null, fallbackUserId?: string | null): string {
    if (!row) return fallbackUserId ?? "不明";
    const full = `${row.last_name_kanji ?? ""}${row.first_name_kanji ?? ""}`.trim();
    return full || fallbackUserId || row.user_id || "不明";
}

function normalizeForMatch(s: string): string {
    return s.replace(/[ 　\t\r\n\-ー_]/g, "").toLowerCase();
}

function hasMorningHint(text: string | null): boolean {
    if (!text) return false;
    return /(午前|朝|am|AM|a\.m\.)/.test(text);
}

function hasAfternoonHint(text: string | null): boolean {
    if (!text) return false;
    return /(午後|夕方|夜|pm|PM|p\.m\.)/.test(text);
}

function messageImpliesRequesterIsStaff(text: string | null): boolean {
    if (!text) return false;
    return /(私|わたし|自分|僕|ぼく|俺|おれ|私が行きます|自分が行きます|入ります|対応します|行きます)/.test(text);
}

function extractTimeRangeFromText(text: string | null): { start: string | null; end: string | null } {
    if (!text) return { start: null, end: null };

    const normalized = text
        .replace(/：/g, ":")
        .replace(/[〜～ｰ－—ー−-]/g, "~")
        .replace(/\s+/g, " ");

    // 9:30~12:00 / 9:30-12:00
    const m = normalized.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
    if (m) {
        return {
            start: normalizeTime(m[1]),
            end: normalizeTime(m[2]),
        };
    }

    // 開始 9:30 終了 12:00
    const m2 = normalized.match(/開始[^0-9]*(\d{1,2}:\d{2}).*終了[^0-9]*(\d{1,2}:\d{2})/);
    if (m2) {
        return {
            start: normalizeTime(m2[1]),
            end: normalizeTime(m2[2]),
        };
    }

    return { start: null, end: null };
}

function extractSingleLabeledTime(text: string | null, label: "開始" | "終了"): string | null {
    if (!text) return null;

    const normalized = text
        .replace(/：/g, ":")
        .replace(/[〜～ｰ－—ー−-]/g, "~")
        .replace(/\s+/g, " ");

    const re = label === "開始"
        ? /開始(?:時間)?[^0-9午前午後]*(午前|午後)?\s*(\d{1,2}:\d{2})/
        : /終了(?:時間)?[^0-9午前午後]*(午前|午後)?\s*(\d{1,2}:\d{2})/;

    const m = normalized.match(re);
    if (!m) return null;

    const ampm = m[1] ?? null;
    const hhmm = normalizeTime(m[2]);
    if (!hhmm) return null;

    const [hh, mm] = hhmm.split(":").map(Number);

    if (ampm === "午後" && hh < 12) {
        return `${String(hh + 12).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    if (ampm === "午前" && hh === 12) {
        return `00:${String(mm).padStart(2, "0")}`;
    }

    return hhmm;
}

function cleanServiceCodeInput(text: string | null): string | null {
    if (!text) return null;

    let s = text
        .replace(/^サービスコード[は:： ]*/u, "")
        .replace(/[。．]$/u, "")
        .replace(/です$/u, "")
        .replace(/でした$/u, "")
        .replace(/にしたい$/u, "")
        .replace(/でお願いします$/u, "")
        .trim();

    if (!s) return null;

    // 全角カッコ・空白ゆれを少し寄せる
    s = s
        .replace(/（/g, "(")
        .replace(/）/g, ")")
        .replace(/\s+/g, " ")
        .trim();

    return s;
}

function extractLabeledServiceCode(text: string | null): string | null {
    if (!text) return null;

    const normalized = text
        .replace(/：/g, ":")
        .replace(/\s+/g, " ")
        .trim();

    const m = normalized.match(/サービスコード[は:： ]*([^\n\r。]+?)(?:です|でした|でお願いします|にしたい)?$/u);
    if (!m) return null;

    return cleanServiceCodeInput(m[1] ?? null);
}

function pickPreferredStartTime(params: {
    sourceMessage: string | null;
    currentStartTime: string | null;
    dialogflowStartTime: string | null;
    textRangeStart: string | null;
}): string | null {
    const text = params.sourceMessage ?? "";

    const explicitStartCorrection =
        /開始|開始時間|から/.test(text) && !!params.textRangeStart;

    if (explicitStartCorrection) {
        return params.textRangeStart;
    }

    const looksLikePartialCorrection =
        /終了|担当者|サービスコード/.test(text) &&
        !/開始|開始時間|サービス時間|から|~|〜|-/.test(text);

    if (looksLikePartialCorrection) {
        return params.currentStartTime ?? params.dialogflowStartTime ?? params.textRangeStart ?? null;
    }

    return params.dialogflowStartTime ?? params.textRangeStart ?? params.currentStartTime ?? null;
}

function toMinutes(hhmm: string | null): number | null {
    if (!hhmm) return null;
    const m = hhmm.match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

function addMinutesToHHMM(hhmm: string | null, mins: number | null): string | null {
    if (!hhmm || mins === null) return null;
    const base = toMinutes(hhmm);
    if (base === null) return null;
    const total = base + mins;
    if (total < 0) return null;
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function inferEndTimeByPreviousDuration(params: {
    startTime: string | null;
    prevStartTime: string | null;
    prevEndTime: string | null;
}): string | null {
    const start = toMinutes(params.startTime);
    const prevStart = toMinutes(params.prevStartTime);
    const prevEnd = toMinutes(params.prevEndTime);
    if (start === null || prevStart === null || prevEnd === null) return null;
    const duration = prevEnd - prevStart;
    if (duration <= 0 || duration > 12 * 60) return null;
    return addMinutesToHHMM(params.startTime, duration);
}

async function getPreviousPrimaryStaffUserId(params: {
    kaipokeCsId: string | null;
    shiftDate: string | null;
    startTime: string | null;
}): Promise<string | null> {
    const prev = await findPreviousShiftForSuggestion({
        kaipokeCsId: params.kaipokeCsId,
        shiftDate: params.shiftDate,
        startTime: params.startTime,
    });
    return prev?.staff_01_user_id ?? null;
}

async function inferServiceCodeFromTextOrPrevious(params: {
    sourceMessage: string | null;
    pending: PendingRow;
    kaipokeCsId: string | null;
    shiftDate: string | null;
    startTime: string | null;
}): Promise<{ serviceCode: string | null; reason: string | null }> {
    const cleaned = cleanServiceCodeInput(params.sourceMessage);

    const candidates = await findServiceCodeCandidates({
        sourceMessage: cleaned ?? params.sourceMessage,
        limit: 3,
    });

    if (candidates.length > 0) {
        return {
            serviceCode: candidates[0].service_code,
            reason: `本文近似一致: ${candidates[0].service_code}`,
        };
    }

    const prev = await findPreviousShiftForSuggestion({
        kaipokeCsId: params.kaipokeCsId,
        shiftDate: params.shiftDate,
        startTime: params.startTime,
    });

    return {
        serviceCode: prev?.service_code ?? null,
        reason: prev?.service_code ? "前回シフトのサービスコード" : null,
    };
}

function buildCreateShiftProposalMessage(params: {
    shiftDate: string | null;
    startTime: string | null;
    endTime: string | null;
    serviceCode: string | null;
    staffDisplayName: string | null;
    reasons?: string[];
}) {
    const lines = [
        "現時点までの情報を総合的に勘案し、以下のシフト追加を推奨します。",
        "",
        `日付：${params.shiftDate ?? "未指定"}`,
        `開始：${params.startTime ?? "未指定"}`,
        `終了：${params.endTime ?? "未指定"}`,
        `サービスコード：${params.serviceCode ?? "未指定"}`,
        `担当者：${params.staffDisplayName ?? "未指定"}`,
    ];

    if (params.reasons?.length) {
        lines.push("", "補完根拠:");
        for (const r of params.reasons) lines.push(`・${r}`);
    }

    lines.push(
        "",
        "この内容でシフト追加する場合は「はい」「OK」等のコメントをお願いします。",
        "変更したい点があれば、「終了時間は12時にしたい」等のコメントをお願いします。",
        "シフト追加処理を停止したい場合は「いいえ」等のコメントをお願いします。現在のシフト追加処理は初期化されます。"
    );

    return lines.join("\n");
}



function normalizeDurationToHHMM(v: unknown): string | null {
    if (v === null || v === undefined) return null;

    if (typeof v === "object") {
        const obj = v as Record<string, unknown>;

        const amount = Number(obj.amount ?? NaN);
        const unit = normalizeString(obj.unit)?.toLowerCase();
        if (!Number.isNaN(amount) && unit) {
            if (unit.includes("hour")) {
                const mins = Math.round(amount * 60);
                const hh = String(Math.floor(mins / 60)).padStart(2, "0");
                const mm = String(mins % 60).padStart(2, "0");
                return `${hh}:${mm}`;
            }
            if (unit.includes("min")) {
                const mins = Math.round(amount);
                const hh = String(Math.floor(mins / 60)).padStart(2, "0");
                const mm = String(mins % 60).padStart(2, "0");
                return `${hh}:${mm}`;
            }
        }
    }

    const s = normalizeString(v);
    if (!s) return null;

    // PT2H / PT1H30M / PT90M
    const isoHours = s.match(/(\d+)H/);
    const isoMins = s.match(/(\d+)M/);
    if (s.startsWith("PT")) {
        const hh = isoHours ? Number(isoHours[1]) : 0;
        const mm = isoMins ? Number(isoMins[1]) : 0;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    // 02:00
    if (/^\d{1,2}:\d{2}$/.test(s)) {
        const [h, m] = s.split(":");
        return `${String(Number(h)).padStart(2, "0")}:${m}`;
    }

    // 2時間半 / 1時間30分 / 90分 / 2時間
    const hourMatch = s.match(/(\d+)\s*時間/);
    const minMatch = s.match(/(\d+)\s*分/);
    const hasHalf = s.includes("半");

    if (hourMatch || minMatch || hasHalf) {
        let hh = hourMatch ? Number(hourMatch[1]) : 0;
        let mm = minMatch ? Number(minMatch[1]) : 0;
        if (hasHalf && !minMatch) mm += 30;
        hh += Math.floor(mm / 60);
        mm = mm % 60;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    return null;
}

function asStringArray(v: unknown): string[] {
    if (Array.isArray(v)) {
        return v
            .map((x) => normalizeString(x))
            .filter((x): x is string => !!x);
    }
    const one = normalizeString(v);
    return one ? [one] : [];
}

function buildSessionKey(channelId: string, requesterLwUserid: string | null) {
    return `${channelId}::${requesterLwUserid ?? "unknown"}`;
}

function requiredMissing(p: {
    targetKaipokeCsId: string | null;
    shiftDate: string | null;
    startTime: string | null;
    endTime: string | null;
    serviceCode: string | null;
    staff01UserId: string | null;
}) {
    const missing: string[] = [];
    if (!p.targetKaipokeCsId) missing.push("利用者");
    if (!p.shiftDate) missing.push("日付");
    if (!p.startTime) missing.push("開始時刻");
    if (!p.endTime) missing.push("終了時刻");
    if (!p.serviceCode) missing.push("サービス種別");
    if (!p.staff01UserId) missing.push("担当者");
    return missing;
}

function supportTypeLabel(v: string | null) {
    if (v === "two_person_care") return "2人介助";
    if (v === "accompany") return "同行";
    return "通常";
}

function buildRolesFromSupportType(supportType: string | null) {
    if (supportType === "two_person_care") {
        return {
            staff02Role: "second_caregiver",
            staff03Role: null as string | null,
            baseRequiredCount: 2,
            twoPersonWorkFlg: true,
        };
    }

    if (supportType === "accompany") {
        return {
            staff02Role: "companion",
            staff03Role: null as string | null,
            baseRequiredCount: 1,
            twoPersonWorkFlg: false,
        };
    }

    return {
        staff02Role: null as string | null,
        staff03Role: null as string | null,
        baseRequiredCount: 1,
        twoPersonWorkFlg: false,
    };
}

async function resolveTargetFromChannel(channelId: string): Promise<ResolvedTarget> {
    const { data, error } = await supabaseAdmin
        .from("group_lw_channel_view")
        .select("group_id, group_name, group_account, group_type, channel_id")
        .eq("channel_id", channelId)
        .maybeSingle();

    if (error || !data?.group_account) return null;

    const groupAccount = String(data.group_account);

    const { data: csRow } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("kaipoke_cs_id, name")
        .eq("kaipoke_cs_id", groupAccount)
        .maybeSingle();

    if (csRow?.kaipoke_cs_id) {
        return {
            kind: "client",
            kaipoke_cs_id: csRow.kaipoke_cs_id,
            client_name: (csRow as { name?: string | null }).name ?? null,
            group_account: groupAccount,
        };
    }

    return {
        kind: "staff",
        kaipoke_cs_id: null,
        client_name: null,
        group_account: groupAccount,
    };
}

async function resolveUserIdFromLwUserid(lwUserid: string | null): Promise<string | null> {
    if (!lwUserid) return null;

    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, lw_userid")
        .eq("lw_userid", lwUserid)
        .maybeSingle();

    if (error || !data?.user_id) return null;
    return String(data.user_id);
}

async function resolveUserIdFromStaffName(staffName: string | null): Promise<string | null> {
    const raw = normalizeString(staffName);
    if (!raw) return null;

    const normalized = raw
        .replace(/^@/, "")
        .replace(/\s+/g, "")
        .replace(/さん$/u, "")
        .trim();

    if (!normalized) return null;

    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, last_name_kanji, first_name_kanji")
        .limit(500);

    if (error || !data?.length) return null;

    for (const row of data as Array<Record<string, unknown>>) {
        const fullName =
            `${normalizeString(row.last_name_kanji) ?? ""}${normalizeString(row.first_name_kanji) ?? ""}`
                .replace(/\s+/g, "")
                .trim();

        if (!fullName) continue;
        if (fullName === normalized) {
            return normalizeString(row.user_id);
        }
    }

    return null;
}

async function resolveStaffUsers(params: {
    requesterLwUserid: string | null;
    mentionLwUserids: string[];
    staffName: string | null;
}): Promise<ResolvedStaff> {
    const mentionResolvedUserIds: string[] = [];

    for (const lwUserid of params.mentionLwUserids.slice(0, 3)) {
        const resolved = await resolveUserIdFromLwUserid(lwUserid);
        if (resolved) mentionResolvedUserIds.push(resolved);
    }

    const requesterUserId = await resolveUserIdFromLwUserid(params.requesterLwUserid);

    const staffNameResolvedUserId =
        mentionResolvedUserIds[0]
            ? null
            : await resolveUserIdFromStaffName(params.staffName);

    return {
        requesterUserId,
        mentionResolvedUserIds,
        mentionPrimaryUserId: mentionResolvedUserIds[0] ?? null,
        staffNameResolvedUserId,
    };
}

function normalizeMessageForLookup(text: string | null): string | null {
    if (!text) return null;
    return text
        .replace(/\s+/g, " ")
        .replace(/（/g, "(")
        .replace(/）/g, ")")
        .trim()
        .toLowerCase();
}

function extractMentionLwUserIds(data: Record<string, unknown>): string[] {
    const ids = new Set<string>();

    const content = (data.content ?? {}) as Record<string, unknown>;
    const mentions = content.mentions;

    if (Array.isArray(mentions)) {
        for (const m of mentions) {
            const obj = m as Record<string, unknown>;
            const userId =
                normalizeString(obj.userId) ??
                normalizeString(obj.userid) ??
                normalizeString(obj.user_id) ??
                normalizeString(obj.mentionedUserId);

            if (userId) ids.add(userId);
        }
    }

    const sourceUserId = normalizeString(
        (data.source as Record<string, unknown> | undefined)?.userId
    );
    if (sourceUserId) {
        ids.delete(sourceUserId);
    }

    return Array.from(ids);
}

async function findRecentMentionLwUseridsFromLog(params: {
    channelId: string;
    requesterLwUserid: string | null;
    sourceMessage: string | null;
}): Promise<string[]> {
    const normalized = normalizeMessageForLookup(params.sourceMessage);
    if (!normalized) return [];

    const { data, error } = await supabaseAdmin
        .from("msg_lw_log")
        .select("message, mention_lw_userids, raw_event, user_id, channel_id, timestamp")
        .eq("channel_id", params.channelId)
        .eq("user_id", params.requesterLwUserid)
        .order("timestamp", { ascending: false })
        .limit(20);

    if (error || !data?.length) return [];

    for (const row of data as Array<Record<string, unknown>>) {
        const message = normalizeMessageForLookup(
            typeof row.message === "string" ? row.message : null
        );
        if (!message) continue;
        if (message !== normalized) continue;

        const mentionIds = row.mention_lw_userids;
        if (Array.isArray(mentionIds) && mentionIds.length > 0) {
            return mentionIds.filter((x): x is string => typeof x === "string");
        }

        const rawEvent = (row.raw_event ?? null) as Record<string, unknown> | null;
        if (rawEvent) {
            const recovered = extractMentionLwUserIds(rawEvent);
            if (recovered.length > 0) {
                return recovered;
            }
        }
    }

    return [];
}


async function getStaffDisplayByUserId(userId: string | null): Promise<StaffDisplayRow | null> {
    if (!userId) return null;

    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, lw_userid, last_name_kanji, first_name_kanji")
        .eq("user_id", userId)
        .maybeSingle();

    if (error || !data?.user_id) return null;
    return data as StaffDisplayRow;
}

async function getPendingBySessionKey(sessionKey: string): Promise<PendingRow | null> {
    const { data, error } = await supabaseAdmin
        .from("dialogflow_pending_shift_requests")
        .select("*")
        .eq("session_key", sessionKey)
        .maybeSingle();

    if (error) {
        console.error("[dialogflow webhook] getPendingBySessionKey error", error);
        return null;
    }

    return (data as PendingRow | null) ?? null;
}

async function upsertPendingBase(params: {
    sessionKey: string;
    channelId: string;
    requesterLwUserid: string | null;
    requesterUserId: string | null;
    targetKaipokeCsId: string | null;
    mentionLwUserids: string[];
    sourceMessage: string | null;
    rawDialogflow: unknown;
}) {
    const payload = {
        session_key: params.sessionKey,
        channel_id: params.channelId,
        requester_lw_userid: params.requesterLwUserid,
        requester_user_id: params.requesterUserId,
        target_kaipoke_cs_id: params.targetKaipokeCsId,
        mentioned_lw_userids: params.mentionLwUserids,
        last_message: params.sourceMessage,
        source_message: params.sourceMessage,
        raw_dialogflow: params.rawDialogflow,
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };

    const { data, error } = await supabaseAdmin
        .from("dialogflow_pending_shift_requests")
        .upsert(payload, { onConflict: "session_key" })
        .select("*")
        .single();

    if (error) {
        console.error("[dialogflow webhook] upsertPendingBase error", error);
        throw error;
    }

    return data as PendingRow;
}

async function patchPending(sessionKey: string, patch: Record<string, unknown>): Promise<PendingRow> {
    const patchWithExpiry = {
        ...patch,
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };

    const { data, error } = await supabaseAdmin
        .from("dialogflow_pending_shift_requests")
        .update(patchWithExpiry)
        .eq("session_key", sessionKey)
        .select("*")
        .single();

    if (error) {
        console.error("[dialogflow webhook] patchPending error", error);
        throw error;
    }

    return data as PendingRow;
}

async function findPreviousShiftForCreateInference(params: {
    kaipokeCsId: string | null;
    shiftDate: string | null;
    startTime: string | null;
    serviceCode: string | null;
}): Promise<ShiftRow | null> {
    if (!params.kaipokeCsId || !params.shiftDate) return null;

    const sameDayTimeFilter =
        params.startTime && /^\d{2}:\d{2}$/.test(params.startTime)
            ? `and(shift_start_date.eq.${params.shiftDate},shift_start_time.lt.${params.startTime})`
            : null;

    const orFilter = [
        `shift_start_date.lt.${params.shiftDate}`,
        sameDayTimeFilter,
    ]
        .filter(Boolean)
        .join(",");

    // ① まず同じサービスコードで探す
    if (params.serviceCode) {
        const { data: sameSvc, error: sameSvcError } = await supabaseAdmin
            .from("shift")
            .select("*")
            .eq("kaipoke_cs_id", params.kaipokeCsId)
            .eq("service_code", params.serviceCode)
            .or(orFilter)
            .order("shift_start_date", { ascending: false })
            .order("shift_start_time", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!sameSvcError && sameSvc) {
            return sameSvc as ShiftRow;
        }
    }

    // ② なければ従来どおり直近シフト
    const { data, error } = await supabaseAdmin
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", params.kaipokeCsId)
        .or(orFilter)
        .order("shift_start_date", { ascending: false })
        .order("shift_start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return data as ShiftRow;
}

async function serviceCodeExists(serviceCode: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("shift_service_code")
        .select("service_code")
        .eq("service_code", serviceCode)
        .maybeSingle();

    if (error) return false;
    return !!data?.service_code;
}

async function findShiftByExactKey(params: {
    kaipokeCsId: string | null;
    shiftDate: string | null;
    startTime: string | null;
}): Promise<ShiftRow | null> {
    if (!params.kaipokeCsId || !params.shiftDate || !params.startTime) return null;

    const { data, error } = await supabaseAdmin
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", params.kaipokeCsId)
        .eq("shift_start_date", params.shiftDate)
        .eq("shift_start_time", `${params.startTime}:00`)
        .maybeSingle();

    if (!error && data) return data as ShiftRow;

    const { data: data2, error: error2 } = await supabaseAdmin
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", params.kaipokeCsId)
        .eq("shift_start_date", params.shiftDate)
        .eq("shift_start_time", params.startTime)
        .maybeSingle();

    if (error2 || !data2) return null;
    return data2 as ShiftRow;
}

async function listShiftsOnDate(params: {
    kaipokeCsId: string | null;
    shiftDate: string | null;
}): Promise<ShiftRow[]> {
    if (!params.kaipokeCsId || !params.shiftDate) return [];

    const { data, error } = await supabaseAdmin
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", params.kaipokeCsId)
        .eq("shift_start_date", params.shiftDate)
        .order("shift_start_time", { ascending: true });

    if (error || !data) return [];
    return data as ShiftRow[];
}
async function findPreviousShiftForSuggestion(params: {
    kaipokeCsId: string | null;
    shiftDate: string | null;
    startTime: string | null;
}): Promise<ShiftRow | null> {
    if (!params.kaipokeCsId || !params.shiftDate) return null;

    const sameDayTimeFilter =
        params.startTime && /^\d{2}:\d{2}$/.test(params.startTime)
            ? `and(shift_start_date.eq.${params.shiftDate},shift_start_time.lt.${params.startTime})`
            : null;

    const orFilter = [
        `shift_start_date.lt.${params.shiftDate}`,
        sameDayTimeFilter,
    ]
        .filter(Boolean)
        .join(",");

    const { data, error } = await supabaseAdmin
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", params.kaipokeCsId)
        .or(orFilter)
        .order("shift_start_date", { ascending: false })
        .order("shift_start_time", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return data as ShiftRow;
}

async function findServiceCodeCandidates(params: {
    sourceMessage: string | null;
    limit?: number;
}): Promise<ServiceCodeCandidate[]> {
    const text = normalizeString(params.sourceMessage);
    if (!text) return [];

    const tokens = Array.from(
        new Set(
            text
                .split(/[、。\s\n\r\t]+/)
                .map((x) => x.trim())
                .filter((x) => x.length >= 2)
        )
    ).slice(0, 8);

    const { data, error } = await supabaseAdmin
        .from("shift_service_code")
        .select("service_code, plan_display_name, plan_service_category")
        .not("service_code", "is", null)
        .limit(300);

    if (error || !data?.length) {
        console.error("[dialogflow webhook] findServiceCodeCandidates error", error);
        return [];
    }

    const scored = (data as Array<{
        service_code: string | null;
        plan_display_name?: string | null;
        plan_service_category?: string | null;
    }>)
        .filter((row) => !!row.service_code)
        .map((row) => {
            const serviceCode = String(row.service_code);
            const joinedNorm = normalizeForMatch(
                `${serviceCode} ${row.plan_display_name ?? ""} ${row.plan_service_category ?? ""}`
            );
            let score = 0;

            for (const token of tokens) {
                const tokenNorm = normalizeForMatch(token);
                if (!tokenNorm) continue;

                if (normalizeForMatch(serviceCode).includes(tokenNorm)) score += 10;
                if (normalizeForMatch(row.plan_display_name ?? "").includes(tokenNorm)) score += 30;
                if (normalizeForMatch(row.plan_service_category ?? "").includes(tokenNorm)) score += 20;
                if (joinedNorm.includes(tokenNorm)) score += 5;
            }

            if (joinedNorm.includes("通院") && normalizeForMatch(text).includes("通院")) score += 20;
            if (joinedNorm.includes("同行") && normalizeForMatch(text).includes("同行")) score += 20;
            if (joinedNorm.includes("家事") && normalizeForMatch(text).includes("家事")) score += 20;
            if (joinedNorm.includes("身体") && normalizeForMatch(text).includes("身体")) score += 20;

            return {
                service_code: serviceCode,
                plan_display_name: row.plan_display_name ?? null,
                plan_service_category: row.plan_service_category ?? null,
                score,
            };
        })
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, params.limit ?? 3);

    return scored;
}

function buildDeleteShiftNotFoundMessage(params: {
    shiftDate: string | null;
    startTime: string | null;
    sameDayShifts: ShiftRow[];
}) {
    const dateText = params.shiftDate ?? "指定日";
    const timeText = params.startTime ?? "指定時刻";

    if (!params.shiftDate) {
        return "いつのシフトですか？";
    }

    if (!params.startTime) {
        return "何時開始のシフトですか？";
    }

    if (params.sameDayShifts.length === 0) {
        return `${dateText} にはシフトがありません。日付をご確認ください。`;
    }

    const candidates = params.sameDayShifts
        .map((row) => {
            const start = normalizeTime(row.shift_start_time) ?? "??:??";
            const end = normalizeTime(row.shift_end_time) ?? "??:??";
            const svc = row.service_code ?? "サービス不明";
            return `${start}-${end}（${svc}）`;
        })
        .slice(0, 5)
        .join("、");

    return [
        `${dateText} の ${timeText} 開始のシフトは見つかりませんでした。`,
        `その日の候補: ${candidates}`,
        "開始時刻をもう一度教えてください。",
    ].join("\n");
}

function buildDeleteShiftCandidatesMessage(params: {
    shiftDate: string;
    sameDayShifts: ShiftRow[];
}) {
    if (params.sameDayShifts.length === 0) {
        return {
            text: `${params.shiftDate} にはシフトがありません。\nシフトは削除されませんでした。`,
            autoSelectedStartTime: null as string | null,
            autoSelectedEndTime: null as string | null,
            autoSelectedServiceCode: null as string | null,
            autoSelectedShiftId: null as number | null,
            confirmSummary: null as string | null,
        };
    }

    if (params.sameDayShifts.length === 1) {
        const row = params.sameDayShifts[0];
        const start = normalizeTime(row.shift_start_time) ?? "未指定";
        const end = normalizeTime(row.shift_end_time) ?? "未指定";
        const svc = row.service_code ?? "未指定";

        const summary = [
            "次のシフトを削除してよいですか？",
            `日付: ${params.shiftDate}`,
            `開始: ${start}`,
            `終了: ${end}`,
            `サービス: ${svc}`,
            "",
            "よろしければ「はい」、やめるなら「いいえ」と入力してください。",
        ].join("\n");

        return {
            text: summary,
            autoSelectedStartTime: start,
            autoSelectedEndTime: end,
            autoSelectedServiceCode: svc,
            autoSelectedShiftId: row.shift_id,
            confirmSummary: summary,
        };
    }

    const candidates = params.sameDayShifts
        .map((row) => {
            const start = normalizeTime(row.shift_start_time) ?? "??:??";
            const end = normalizeTime(row.shift_end_time) ?? "??:??";
            const svc = row.service_code ?? "サービス不明";
            return `・${start}-${end}（${svc}）`;
        })
        .join("\n");

    return {
        text: [
            `${params.shiftDate} には次のシフトがあります。`,
            candidates,
            "何時からのシフトを削除しますか？",
        ].join("\n"),
        autoSelectedStartTime: null as string | null,
        autoSelectedEndTime: null as string | null,
        autoSelectedServiceCode: null as string | null,
        autoSelectedShiftId: null as number | null,
        confirmSummary: null as string | null,
    };
}

async function loadTargetShiftFromPending(pending: PendingRow): Promise<ShiftRow | null> {
    if (pending.target_shift_id) {
        const { data, error } = await supabaseAdmin
            .from("shift")
            .select("*")
            .eq("shift_id", pending.target_shift_id)
            .maybeSingle();

        if (!error && data) return data as ShiftRow;
    }

    return await findShiftByExactKey({
        kaipokeCsId: pending.target_kaipoke_cs_id,
        shiftDate: pending.shift_date,
        startTime: pending.start_time,
    });
}

function extractIntentName(body: Record<string, unknown>): string | null {
    const fulfillmentInfo = body.fulfillmentInfo as Record<string, unknown> | undefined;
    const intentInfo = body.intentInfo as Record<string, unknown> | undefined;

    const tag = normalizeString(fulfillmentInfo?.tag);
    if (tag) return tag;

    const displayName = normalizeString(intentInfo?.displayName);
    if (displayName) return displayName;

    const lastMatchedIntent = normalizeString(intentInfo?.lastMatchedIntent);
    if (lastMatchedIntent) return lastMatchedIntent;

    return null;
}

function extractOriginalText(body: Record<string, unknown>): string | null {
    const texts: string[] = [];

    const text = normalizeString((body as Record<string, unknown>)?.text);
    if (text) texts.push(text);

    const transcript = normalizeString((body as Record<string, unknown>)?.transcript);
    if (transcript) texts.push(transcript);

    const payload = (body.payload ?? body.originalDetectIntentRequest) as Record<string, unknown> | undefined;
    if (payload) {
        const pt = normalizeString(payload.text);
        if (pt) texts.push(pt);
    }

    return texts[0] ?? null;
}

function applyStaffChangeByPosition(params: {
    pending: PendingRow;
    newUserId: string | null;
    staffPosition: string | null;
}) {
    let staff01 = params.pending.staff_01_user_id;
    let staff02 = params.pending.staff_02_user_id;
    let staff03 = params.pending.staff_03_user_id;

    if (params.newUserId) {
        if (params.staffPosition === "second") {
            staff02 = params.newUserId;
        } else if (params.staffPosition === "third") {
            staff03 = params.newUserId;
        } else {
            staff01 = params.newUserId;
        }
    }

    return { staff01, staff02, staff03 };
}

async function buildConfirmSummary(pending: PendingRow) {
    const supportLabel = supportTypeLabel(pending.support_type);
    const judoText = pending.is_judo_ido ? `あり (${compactToDisplayHHMM(pending.judo_ido)})` : "なし";

    const staffLines = [
        `主担当: ${pending.staff_01_user_id ?? "未指定"}`,
        pending.staff_02_user_id
            ? `2人目: ${pending.staff_02_user_id}${pending.staff_02_role ? ` (${pending.staff_02_role})` : ""}`
            : null,
        pending.staff_03_user_id
            ? `3人目: ${pending.staff_03_user_id}${pending.staff_03_role ? ` (${pending.staff_03_role})` : ""}`
            : null,
    ].filter(Boolean);

    const reasonLine =
        pending.inferred_service_code && pending.inferred_service_reason
            ? `\nサービス推定根拠: ${pending.inferred_service_reason}`
            : "";

    return [
        "確認です。",
        `利用者: ${pending.target_kaipoke_cs_id ?? "未指定"}`,
        `日付: ${pending.shift_date ?? "未指定"}`,
        `時間: ${pending.start_time ?? "未指定"}-${pending.end_time ?? "未指定"}`,
        `サービスコード: ${pending.service_code ?? "未指定"}`,
        `体制: ${supportLabel}`,
        `必要人数: ${pending.required_staff_count ?? 1}`,
        `重度移動: ${judoText}`,
        ...staffLines,
        reasonLine ? reasonLine.trimStart() : null,
        "この内容でよいですか？",
    ]
        .filter(Boolean)
        .join("\n");
}

async function buildCreateShiftMissingMessage(params: {
    pending: PendingRow;
}) {
    const prev = await findPreviousShiftForCreateInference({
        kaipokeCsId: params.pending.target_kaipoke_cs_id,
        shiftDate: params.pending.shift_date,
        startTime: params.pending.start_time,
        serviceCode: params.pending.service_code,
    });

    const currentStaffDisplay = await getStaffDisplayByUserId(
        params.pending.staff_01_user_id ?? null
    );

    let inferredStartTime = params.pending.start_time;
    let inferredEndTime = params.pending.end_time;

    if (!inferredStartTime && prev?.shift_start_time) {
        inferredStartTime = normalizeTime(prev.shift_start_time);
    }

    if (!inferredEndTime) {
        if (prev?.shift_start_time && prev?.shift_end_time) {
            inferredEndTime =
                inferEndTimeByPreviousDuration({
                    startTime: inferredStartTime,
                    prevStartTime: normalizeTime(prev.shift_start_time),
                    prevEndTime: normalizeTime(prev.shift_end_time),
                }) ??
                normalizeTime(prev.shift_end_time);
        }
    }

    const reasons: string[] = [];

    if (params.pending.staff_01_user_id) {
        reasons.push("担当者はメンション・自分指定・前回担当を優先して補完");
    }

    if (params.pending.service_code) {
        reasons.push(
            params.pending.inferred_service_reason ??
            "サービスコードは本文近似または前回シフトから補完"
        );
    }

    if (!params.pending.start_time && inferredStartTime && prev?.service_code === params.pending.service_code) {
        reasons.push("開始時間は前回の同一サービスの時刻を参考に補完");
    }

    if (!params.pending.end_time && inferredEndTime && prev?.shift_start_time && prev?.shift_end_time) {
        reasons.push("終了時間は前回の同一サービスの所要時間を参考に補完");
    }

    return buildCreateShiftProposalMessage({
        shiftDate: params.pending.shift_date,
        startTime: inferredStartTime,
        endTime: inferredEndTime,
        serviceCode: params.pending.service_code,
        staffDisplayName: displayStaffName(
            currentStaffDisplay,
            params.pending.staff_01_user_id
        ),
        reasons,
    });
}
async function finalizeToConfirm(
    sessionKey: string,
    patched: PendingRow,
    messagePrefix?: string
) {
    const missing = requiredMissing({
        targetKaipokeCsId: patched.target_kaipoke_cs_id,
        shiftDate: patched.shift_date,
        startTime: patched.start_time,
        endTime: patched.end_time,
        serviceCode: patched.service_code,
        staff01UserId: patched.staff_01_user_id,
    });

    if (missing.length > 0) {
        const message = await buildCreateShiftMissingMessage({ pending: patched });
        const prefix = messagePrefix ? `${messagePrefix}\n` : "";

        await patchPending(sessionKey, {
            status: "collecting",
            confirm_summary: null,
        });

        return jsonText(
            `${prefix}${message}`,
            {
                operation_type: "create",
                awaiting_missing_fields: true,
                flow_stage: "missing",
                shift_date: patched.shift_date,
                start_time: patched.start_time,
                end_time: patched.end_time,
                service_code: patched.service_code,
                staff_name: patched.staff_01_user_id,
            },
            "create"
        );
    }

    const summary = await buildConfirmSummary(patched);

    await patchPending(sessionKey, {
        status: "confirming",
        confirm_summary: summary,
    });

    return jsonText(
        messagePrefix ? `${messagePrefix}\n${summary}` : summary,
        {
            operation_type: "create",
            awaiting_missing_fields: false,
            flow_stage: "confirm",
            shift_date: patched.shift_date,
            start_time: patched.start_time,
            end_time: patched.end_time,
            service_code: patched.service_code,
            staff_name: patched.staff_01_user_id,
            confirm_summary: summary,
        },
        "create"
    );
}
async function handleCreateShiftMissingReady(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
    resolvedTarget: ResolvedTarget;
    resolvedStaff: ResolvedStaff;
}) {
    const p = params.dialogflowParams;
    const sourceMessage = params.pending.last_message ?? normalizeString(p.original_message) ?? null;

    const textRange = extractTimeRangeFromText(sourceMessage);

    const shiftDate =
        normalizeDate(p.shift_date) ??
        params.pending.shift_date ??
        null;

    const labeledStart =
        extractSingleLabeledTime(sourceMessage, "開始");

    const rawDialogflowStart =
        normalizeTimeForCreate(p.start_time, sourceMessage) ??
        normalizeTimeForCreate(p.date_time, sourceMessage) ??
        null;

    const startTime = pickPreferredStartTime({
        sourceMessage,
        currentStartTime: params.pending.start_time,
        dialogflowStartTime: rawDialogflowStart,
        textRangeStart: labeledStart ?? textRange.start,
    });

    const prev = await findPreviousShiftForSuggestion({
        kaipokeCsId:
            params.resolvedTarget?.kaipoke_cs_id ??
            params.pending.target_kaipoke_cs_id,
        shiftDate,
        startTime,
    });

    let endTime =
        extractSingleLabeledTime(sourceMessage, "終了") ??
        normalizeTimeForCreate(p.end_time, sourceMessage) ??
        textRange.end ??
        params.pending.end_time ??
        null;

    // 「午後 0:00」は 12:00 扱いに寄せる
    if (sourceMessage && /終了.*午後\s*0:00/.test(sourceMessage) && endTime === "00:00") {
        endTime = "12:00";
    }

    if (!endTime) {
        endTime = inferEndTimeByPreviousDuration({
            startTime,
            prevStartTime: normalizeTime(prev?.shift_start_time ?? null),
            prevEndTime: normalizeTime(prev?.shift_end_time ?? null),
        });
    }

    const explicitServiceCode =
        extractLabeledServiceCode(sourceMessage) ??
        cleanServiceCodeInput(normalizeString(p.service_code)) ??
        null;

    let serviceCode =
        explicitServiceCode ??
        params.pending.service_code ??
        null;

    let inferredServiceReason: string | null = params.pending.inferred_service_reason ?? null;

    if (serviceCode) {
        const exists = await serviceCodeExists(serviceCode);
        if (!exists) {
            const inferred = await inferServiceCodeFromTextOrPrevious({
                sourceMessage: serviceCode,
                pending: params.pending,
                kaipokeCsId:
                    params.resolvedTarget?.kaipoke_cs_id ??
                    params.pending.target_kaipoke_cs_id,
                shiftDate,
                startTime,
            });
            serviceCode = inferred.serviceCode;
            inferredServiceReason = inferred.reason;
        } else {
            inferredServiceReason = "本文明示指定";
        }
    }

    if (!serviceCode) {
        const inferred = await inferServiceCodeFromTextOrPrevious({
            sourceMessage,
            pending: params.pending,
            kaipokeCsId:
                params.resolvedTarget?.kaipoke_cs_id ??
                params.pending.target_kaipoke_cs_id,
            shiftDate,
            startTime,
        });
        serviceCode = inferred.serviceCode;
        inferredServiceReason = inferred.reason;
    }

    const staffPosition = normalizeString(p.staff_position);

    const explicitStaffUserId =
        params.resolvedStaff.mentionPrimaryUserId ??
        params.resolvedStaff.staffNameResolvedUserId ??
        null;

    const selfStaff =
        !explicitStaffUserId &&
            messageImpliesRequesterIsStaff(sourceMessage)
            ? params.resolvedStaff.requesterUserId
            : null;

    const previousStaff =
        !explicitStaffUserId && !selfStaff
            ? await getPreviousPrimaryStaffUserId({
                kaipokeCsId:
                    params.resolvedTarget?.kaipoke_cs_id ??
                    params.pending.target_kaipoke_cs_id,
                shiftDate,
                startTime,
            })
            : null;

    const chosenStaffUserId =
        explicitStaffUserId ??
        selfStaff ??
        previousStaff ??
        params.pending.staff_01_user_id ??
        null;

    const changed = applyStaffChangeByPosition({
        pending: params.pending,
        newUserId: chosenStaffUserId,
        staffPosition,
    });

    const staff01 = changed.staff01 ?? null;

    const patched = await patchPending(params.sessionKey, {
        intent_name: "create_shift",
        status: "collecting",
        target_kaipoke_cs_id:
            params.resolvedTarget?.kaipoke_cs_id ??
            params.pending.target_kaipoke_cs_id,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        service_code: serviceCode,
        staff_01_user_id: staff01,
        //staff_name_resolved_user_id: params.resolvedStaff.staffNameResolvedUserId,
        inferred_service_code: serviceCode,
        inferred_service_reason: inferredServiceReason,
    });

    console.info("[dialogflow webhook] create_shift_missing_ready source", {
        session_key: params.sessionKey,
        source_message: sourceMessage,
        text_range: textRange,
        raw_start_time: p.start_time ?? p.date_time ?? null,
        normalized_start_time: startTime,
        raw_end_time: p.end_time ?? null,
        normalized_end_time: endTime,
        raw_service_code: p.service_code ?? null,
        normalized_service_code: serviceCode,
        //staff_name_resolved_user_id: params.resolvedStaff.staffNameResolvedUserId,
        mentioned_lw_userids: params.pending.mentioned_lw_userids,
        mention_resolved_user_ids: params.resolvedStaff.mentionResolvedUserIds,
        requester_user_id: params.resolvedStaff.requesterUserId,
        chosen_staff_user_id: staff01,
        inferred_service_reason: inferredServiceReason,
    });

    const message = await buildCreateShiftMissingMessage({
        pending: patched,
    });

    return jsonText(message, {
        operation_type: "create",
        awaiting_missing_fields: true,
        flow_stage: "missing",
        shift_date: patched.shift_date,
        start_time: patched.start_time,
        end_time: patched.end_time,
        service_code: patched.service_code,
        staff_name: patched.staff_01_user_id,
    }, "create");
}

async function handleCreateShift(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
    resolvedTarget: ResolvedTarget;
    resolvedStaff: ResolvedStaff;
}) {
    const p = params.dialogflowParams;
    const sourceMessage =
        params.pending.last_message ??
        normalizeString(p.original_message) ??
        null;

    const textRange = extractTimeRangeFromText(sourceMessage);

    const shiftDate =
        normalizeDate(p.shift_date) ??
        params.pending.shift_date ??
        null;

    // ① 本文・Dialogflow・pending から開始時刻候補
    let startTime =
        normalizeTimeForCreate(p.start_time, sourceMessage) ??
        normalizeTimeForCreate(p.date_time, sourceMessage) ??
        textRange.start ??
        params.pending.start_time ??
        null;

    // ② サービスコードは先に決める
    let serviceCode =
        normalizeString(p.service_code) ??
        params.pending.service_code ??
        null;

    let inferredServiceCode: string | null =
        params.pending.inferred_service_code ?? null;
    let inferredServiceReason: string | null =
        params.pending.inferred_service_reason ?? null;

    if (messageImpliesCancellation(sourceMessage)) {
        const patched = await patchPending(params.sessionKey, {
            intent_name: "delete_shift",
            status: "collecting",
            shift_date: shiftDate,
            start_time: startTime,
            end_time: null,
            service_code: null,
            target_shift_id: null,
            confirm_summary: null,
        });

        return jsonText(
            "キャンセルの連絡として読めます。削除対象の日付・開始時刻を確認してください。",
            {
                operation_type: "delete",
                shift_date: patched.shift_date,
                start_time: patched.start_time,
                end_time: null,
                service_code: null,
                target_shift_id: null,
                confirm_summary: null,
            },
            "delete"
        );
    }

    if (!serviceCode) {
        const inferred = await inferServiceCodeFromTextOrPrevious({
            sourceMessage,
            pending: params.pending,
            kaipokeCsId:
                params.resolvedTarget?.kaipoke_cs_id ??
                params.pending.target_kaipoke_cs_id,
            shiftDate,
            startTime,
        });

        serviceCode = inferred.serviceCode;
        inferredServiceCode = inferred.serviceCode;
        inferredServiceReason = inferred.reason;
    }

    // ③ 同一サービス優先で前回シフトを探す
    const prev = await findPreviousShiftForCreateInference({
        kaipokeCsId:
            params.resolvedTarget?.kaipoke_cs_id ??
            params.pending.target_kaipoke_cs_id,
        shiftDate,
        startTime,
        serviceCode,
    });

    // ④ 開始時刻がまだ無ければ、前回同一サービスの開始を採用
    if (!startTime) {
        startTime = normalizeTime(prev?.shift_start_time ?? null);
        if (startTime && !inferredServiceReason) {
            inferredServiceReason = "開始時間は前回の同一サービスの時刻を参考に補完";
        }
    }

    // ⑤ 終了時刻は Dialogflow より本文と duration 推定を優先
    let endTime =
        extractSingleLabeledTime(sourceMessage, "終了") ??
        textRange.end ??
        params.pending.end_time ??
        null;

    if (!endTime) {
        endTime = inferEndTimeByPreviousDuration({
            startTime,
            prevStartTime: normalizeTime(prev?.shift_start_time ?? null),
            prevEndTime: normalizeTime(prev?.shift_end_time ?? null),
        });
    }

    if (!endTime) {
        endTime = normalizeTime(prev?.shift_end_time ?? null);
    }

    // ⑥ サービスコードが未登録なら前回同一サービス/直近に寄せる
    if (serviceCode) {
        const exists = await serviceCodeExists(serviceCode);
        if (!exists) {
            serviceCode = prev?.service_code ?? null;
            inferredServiceCode = serviceCode;
            if (serviceCode) {
                inferredServiceReason = "前回シフトのサービスコード";
            }
        }
    }

    const supportType =
        normalizeString(p.support_type) ??
        params.pending.support_type ??
        null;

    const supportCfg = buildRolesFromSupportType(supportType);

    const isJudoIdo =
        normalizeBoolean(p.is_judo_ido) ??
        params.pending.is_judo_ido ??
        false;

    const normalizedJudo = normalizeDurationToHHMM(p.judo_ido_time);
    const judoIdo = isJudoIdo
        ? hhmmToCompact(
            normalizedJudo ??
            compactToDisplayHHMM(params.pending.judo_ido)
        )
        : "0000";

    const staffPosition = normalizeString(p.staff_position);

    const selfStaff =
        !params.resolvedStaff.mentionPrimaryUserId &&
            messageImpliesRequesterIsStaff(sourceMessage)
            ? params.resolvedStaff.requesterUserId
            : null;

    const previousStaff =
        !params.resolvedStaff.mentionPrimaryUserId && !selfStaff
            ? await getPreviousPrimaryStaffUserId({
                kaipokeCsId:
                    params.resolvedTarget?.kaipoke_cs_id ??
                    params.pending.target_kaipoke_cs_id,
                shiftDate,
                startTime,
            })
            : null;

    const chosenStaffUserId =
        params.resolvedStaff.mentionPrimaryUserId ??
        selfStaff ??
        params.pending.staff_01_user_id ??
        previousStaff ??
        null;

    const changed = applyStaffChangeByPosition({
        pending: params.pending,
        newUserId: chosenStaffUserId,
        staffPosition,
    });

    const staff01 = changed.staff01 ?? null;
    const staff02 = changed.staff02 ?? params.pending.staff_02_user_id ?? null;
    const staff03 = changed.staff03 ?? params.pending.staff_03_user_id ?? null;

    const requiredStaffCount = Math.max(
        supportCfg.baseRequiredCount,
        staff03 ? 3 : staff02 ? 2 : 1
    );

    const patched = await patchPending(params.sessionKey, {
        intent_name: "create_shift",
        status: "collecting",
        target_kaipoke_cs_id:
            params.resolvedTarget?.kaipoke_cs_id ??
            params.pending.target_kaipoke_cs_id,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        service_code: serviceCode,

        staff_01_user_id: staff01,
        staff_02_user_id: staff02,
        staff_03_user_id: staff03,
        staff_02_attend_flg: !!staff02,
        staff_03_attend_flg: !!staff03,

        support_type: supportType,
        required_staff_count: requiredStaffCount,
        two_person_work_flg: supportCfg.twoPersonWorkFlg || !!staff03,
        is_judo_ido: isJudoIdo,
        judo_ido: judoIdo,
        staff_02_role: staff02 ? supportCfg.staff02Role : null,
        staff_03_role: staff03 ? "third_staff" : null,

        inferred_service_code: inferredServiceCode ?? serviceCode,
        inferred_service_reason: inferredServiceReason,
    });

    console.info("[dialogflow webhook] create_shift normalized", {
        source_message: sourceMessage,
        text_range: textRange,
        raw_start_time: p.start_time ?? p.date_time ?? null,
        normalized_start_time: startTime,
        raw_end_time: p.end_time ?? null,
        normalized_end_time: endTime,
        requester_user_id: params.resolvedStaff.requesterUserId,
        chosen_staff_user_id: staff01,
        inferred_service_reason: inferredServiceReason,
        prev_shift_id: prev?.shift_id ?? null,
        prev_service_code: prev?.service_code ?? null,
    });

    if (isJudoIdo && (!normalizedJudo && (!patched.judo_ido || patched.judo_ido === "0000"))) {
        return jsonText(
            "重度移動の時間を教えてください。例: 2時間、1時間半、90分",
            undefined,
            "create"
        );
    }

    return await finalizeToConfirm(params.sessionKey, patched);
}

async function handleCorrectStaff(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
    resolvedStaff: ResolvedStaff;
}) {
    const staffPosition = normalizeString(params.dialogflowParams.staff_position);
    const newUserId =
        params.resolvedStaff.mentionPrimaryUserId ??
        params.resolvedStaff.staffNameResolvedUserId ??
        null;

    if (!newUserId) {
        return jsonText(
            "変更先の担当者を認識できませんでした。@名前 でもう一度お願いします。",
            undefined,
            "create"
        );
    }

    const changed = applyStaffChangeByPosition({
        pending: params.pending,
        newUserId,
        staffPosition,
    });
    const requiredStaffCount = Math.max(
        params.pending.support_type === "two_person_care" ? 2 : 1,
        changed.staff03 ? 3 : changed.staff02 ? 2 : changed.staff01 ? 1 : 0
    );

    const patched = await patchPending(params.sessionKey, {
        intent_name: "create_shift", // ← 固定
        staff_01_user_id: changed.staff01,
        staff_02_user_id: changed.staff02,
        staff_03_user_id: changed.staff03,
        staff_02_attend_flg: !!changed.staff02,
        staff_03_attend_flg: !!changed.staff03,
        required_staff_count: requiredStaffCount,
        status: "collecting",
    });

    return await finalizeToConfirm(params.sessionKey, patched, "担当者を変更しました。");
}

async function handleSetSecondStaff(params: {
    sessionKey: string;
    pending: PendingRow;
    resolvedStaff: ResolvedStaff;
}) {
    const secondUserId = params.resolvedStaff.mentionPrimaryUserId;
    if (!secondUserId) {
        return jsonText("2人目のスタッフ名を認識できませんでした。もう一度お願いします。");
    }

    const staff02Role =
        params.pending.support_type === "accompany" ? "companion" : "second_caregiver";

    const patched = await patchPending(params.sessionKey, {
        staff_02_user_id: secondUserId,
        staff_02_attend_flg: true,
        staff_02_role: staff02Role,
        required_staff_count: Math.max(params.pending.required_staff_count ?? 1, 2),
        status: "collecting",
    });

    return await finalizeToConfirm(params.sessionKey, patched, "2人目を設定しました。");
}

async function handleSetThirdStaff(params: {
    sessionKey: string;
    pending: PendingRow;
    resolvedStaff: ResolvedStaff;
}) {
    const thirdUserId = params.resolvedStaff.mentionPrimaryUserId;
    if (!thirdUserId) {
        return jsonText("3人目のスタッフ名を認識できませんでした。もう一度お願いします。");
    }

    const patched = await patchPending(params.sessionKey, {
        staff_03_user_id: thirdUserId,
        staff_03_attend_flg: true,
        staff_03_role: "third_staff",
        required_staff_count: 3,
        status: "collecting",
    });

    return await finalizeToConfirm(params.sessionKey, patched, "3人目を設定しました。");
}

async function handleSetSupportStructure(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
}) {
    const supportType = normalizeString(params.dialogflowParams.support_type);
    if (!supportType) {
        return jsonText("体制を認識できませんでした。2人介助 か 同行 で教えてください。");
    }

    const cfg = buildRolesFromSupportType(supportType);

    const patched = await patchPending(params.sessionKey, {
        support_type: supportType,
        required_staff_count: Math.max(cfg.baseRequiredCount, params.pending.staff_03_user_id ? 3 : params.pending.staff_02_user_id ? 2 : 1),
        two_person_work_flg: cfg.twoPersonWorkFlg || !!params.pending.staff_03_user_id,
        staff_02_role: params.pending.staff_02_user_id ? cfg.staff02Role : null,
        status: "collecting",
    });

    return await finalizeToConfirm(
        params.sessionKey,
        patched,
        `体制を ${supportTypeLabel(supportType)} に設定しました。`
    );
}

async function handleCorrectTime(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
    resolvedTarget: ResolvedTarget;
}) {
    const shiftDate =
        normalizeDate(params.dialogflowParams.shift_date) ??
        params.pending.shift_date ??
        null;

    const startTime =
        normalizeTime(params.dialogflowParams.start_time) ??
        normalizeTime(params.dialogflowParams.date_time) ??
        params.pending.start_time ??
        null;

    const endTime =
        normalizeTime(params.dialogflowParams.end_time) ??
        params.pending.end_time ??
        null;

    const patched = await patchPending(params.sessionKey, {
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        target_shift_id: null,
        confirm_summary: null,
        status: "collecting",
    });

    const operationType = normalizeString(params.dialogflowParams.operation_type);

    const isDeleteFlow =
        operationType === "delete" ||
        params.pending.intent_name === "delete_shift" ||
        params.pending.status === "confirming";

    if (isDeleteFlow) {
        const deletePending = await patchPending(params.sessionKey, {
            intent_name: "delete_shift",
            target_kaipoke_cs_id:
                params.resolvedTarget?.kaipoke_cs_id ??
                patched.target_kaipoke_cs_id,
        });

        const ensured = await ensureTargetShiftForOperation(
            params.sessionKey,
            deletePending,
            { mode: "delete" }
        );

        if (!ensured.ok) return ensured.response;

        const matched = ensured.patched;
        const summary = [
            "次のシフトを削除してよいですか？",
            `日付: ${matched.shift_date ?? "未指定"}`,
            `開始: ${matched.start_time ?? "未指定"}`,
            `終了: ${matched.end_time ?? "未指定"}`,
            `サービス: ${matched.service_code ?? "未指定"}`,
            "",
            "よろしければ「はい」、やめるなら「いいえ」と入力してください。",
        ].join("\n");

        await patchPending(params.sessionKey, {
            intent_name: "delete_shift",
            status: "confirming",
            confirm_summary: summary,
        });

        return jsonText(summary, {
            operation_type: "delete",
            shift_date: patched.shift_date,
            start_time: patched.start_time,
            end_time: patched.end_time,
            service_code: patched.service_code,
            target_shift_id: patched.target_shift_id,
            confirm_summary: summary,
        }, "delete");
    }

    return await finalizeToConfirm(params.sessionKey, patched, "日時を変更しました。");
}

async function handleCorrectServiceCode(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
}) {
    const serviceCode = normalizeString(params.dialogflowParams.service_code);

    if (!serviceCode) {
        return jsonText("サービスコードを認識できませんでした。サービスコードを教えてください。");
    }

    const exists = await serviceCodeExists(serviceCode);
    if (!exists) {
        return jsonText(`サービスコード ${serviceCode} は見つかりませんでした。正しいサービスコードを教えてください。`);
    }

    const patched = await patchPending(params.sessionKey, {
        service_code: serviceCode,
        status: "collecting",
    });

    return await finalizeToConfirm(params.sessionKey, patched, "サービスコードを変更しました。");
}

async function ensureTargetShiftForOperation(
    sessionKey: string,
    pending: PendingRow,
    options?: { mode?: "default" | "delete" }
) {
    const targetShift = await loadTargetShiftFromPending(pending);

    if (!targetShift) {
        if (options?.mode === "delete") {
            const sameDayShifts = await listShiftsOnDate({
                kaipokeCsId: pending.target_kaipoke_cs_id,
                shiftDate: pending.shift_date,
            });

            return {
                ok: false as const,
                response: jsonText(
                    buildDeleteShiftNotFoundMessage({
                        shiftDate: pending.shift_date,
                        startTime: pending.start_time,
                        sameDayShifts,
                    }),
                    {
                        operation_type: "delete",
                        shift_date: pending.shift_date,
                        start_time: null,
                        target_shift_id: null,
                        confirm_summary: null,
                    }
                ),
            };
        }

        return {
            ok: false as const,
            response: jsonText("対象シフトを特定できませんでした。日付と開始時刻をもう一度教えてください。"),
        };
    }

    const patched = await patchPending(sessionKey, {
        target_shift_id: targetShift.shift_id,
        shift_date: normalizeDate(targetShift.shift_start_date),
        start_time: normalizeTime(targetShift.shift_start_time),
        end_time: normalizeTime(targetShift.shift_end_time),
        service_code: targetShift.service_code,
        staff_01_user_id: targetShift.staff_01_user_id,
        staff_02_user_id: targetShift.staff_02_user_id,
        staff_03_user_id: targetShift.staff_03_user_id,
        staff_02_attend_flg: !!targetShift.staff_02_attend_flg,
        staff_03_attend_flg: !!targetShift.staff_03_attend_flg,
        required_staff_count: targetShift.required_staff_count ?? 1,
        two_person_work_flg: !!targetShift.two_person_work_flg,
        judo_ido: targetShift.judo_ido ?? "0000",
    });

    return {
        ok: true as const,
        patched,
        targetShift,
    };
}

async function handleUpdateShift(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
    resolvedTarget: ResolvedTarget;
    resolvedStaff: ResolvedStaff;
}) {
    const p = params.dialogflowParams;

    const targetDate = normalizeDate(p.shift_date) ?? params.pending.shift_date ?? null;
    const targetStart = normalizeTime(p.start_time) ?? normalizeTime(p.date_time) ?? params.pending.start_time ?? null;

    let pending0 = params.pending;
    if (!pending0.target_shift_id) {
        pending0 = await patchPending(params.sessionKey, {
            intent_name: "update_shift",
            target_kaipoke_cs_id: params.resolvedTarget?.kaipoke_cs_id ?? params.pending.target_kaipoke_cs_id,
            shift_date: targetDate,
            start_time: targetStart,
            status: "collecting",
        });
    }

    const ensured = await ensureTargetShiftForOperation(params.sessionKey, pending0);
    if (!ensured.ok) return ensured.response;

    const current = ensured.patched;
    const staffPosition = normalizeString(p.staff_position);
    const newMentioned = params.resolvedStaff.mentionPrimaryUserId;
    const changed = newMentioned
        ? applyStaffChangeByPosition({
            pending: current,
            newUserId: newMentioned,
            staffPosition,
        })
        : {
            staff01: current.staff_01_user_id,
            staff02: current.staff_02_user_id,
            staff03: current.staff_03_user_id,
        };

    const newShiftDate = normalizeDate(p.new_shift_date) ?? normalizeDate(p.shift_date) ?? current.shift_date;
    const newStartTime = normalizeTime(p.new_start_time) ?? normalizeTime(p.start_time) ?? current.start_time;
    const newEndTime = normalizeTime(p.new_end_time) ?? normalizeTime(p.end_time) ?? current.end_time;

    const serviceCodeCandidate = normalizeString(p.service_code) ?? current.service_code;
    const serviceCodeExistsFlg = serviceCodeCandidate ? await serviceCodeExists(serviceCodeCandidate) : false;
    const finalServiceCode = serviceCodeCandidate && serviceCodeExistsFlg ? serviceCodeCandidate : current.service_code;

    const supportType = normalizeString(p.support_type) ?? current.support_type;
    const supportCfg = buildRolesFromSupportType(supportType);

    const isJudoIdo = normalizeBoolean(p.is_judo_ido) ?? current.is_judo_ido ?? false;
    const judoHHMM = normalizeDurationToHHMM(p.judo_ido_time);
    const finalJudo = isJudoIdo
        ? hhmmToCompact(judoHHMM ?? compactToDisplayHHMM(current.judo_ido))
        : "0000";

    const patched = await patchPending(params.sessionKey, {
        intent_name: "update_shift",
        status: "confirming",
        support_type: supportType,
        shift_date: newShiftDate,
        start_time: newStartTime,
        end_time: newEndTime,
        service_code: finalServiceCode,
        staff_01_user_id: changed.staff01,
        staff_02_user_id: changed.staff02,
        staff_03_user_id: changed.staff03,
        staff_02_attend_flg: !!changed.staff02,
        staff_03_attend_flg: !!changed.staff03,
        required_staff_count: Math.max(
            supportCfg.baseRequiredCount,
            changed.staff03 ? 3 : changed.staff02 ? 2 : 1
        ),
        two_person_work_flg: supportCfg.twoPersonWorkFlg || !!changed.staff03,
        is_judo_ido: isJudoIdo,
        judo_ido: finalJudo,
        staff_02_role: changed.staff02 ? supportCfg.staff02Role : null,
        staff_03_role: changed.staff03 ? "third_staff" : null,
    });

    const summary = [
        "対象シフトを更新します。",
        `shift_id: ${patched.target_shift_id ?? "未特定"}`,
        `日付: ${patched.shift_date ?? "未指定"}`,
        `時間: ${patched.start_time ?? "未指定"}-${patched.end_time ?? "未指定"}`,
        `サービスコード: ${patched.service_code ?? "未指定"}`,
        `体制: ${supportTypeLabel(patched.support_type)}`,
        `主担当: ${patched.staff_01_user_id ?? "未指定"}`,
        patched.staff_02_user_id ? `2人目: ${patched.staff_02_user_id}` : null,
        patched.staff_03_user_id ? `3人目: ${patched.staff_03_user_id}` : null,
        `重度移動: ${patched.is_judo_ido ? compactToDisplayHHMM(patched.judo_ido) : "なし"}`,
        "この内容で更新しますか？",
    ]
        .filter(Boolean)
        .join("\n");

    await patchPending(params.sessionKey, {
        status: "confirming",
        confirm_summary: summary,
    });

    return jsonText(summary, undefined, "update");
}

async function handleDeleteShiftDateReady(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
    resolvedTarget: ResolvedTarget;
}) {
    const shiftDate =
        normalizeDate(params.dialogflowParams.shift_date) ??
        params.pending.shift_date ??
        null;

    if (!shiftDate) {
        return jsonText("いつのシフトですか？", {
            operation_type: "delete",
            shift_date: null,
            start_time: null,
            target_shift_id: null,
            confirm_summary: null,
        });
    }

    const patchedBase = await patchPending(params.sessionKey, {
        intent_name: "delete_shift",
        status: "collecting",
        target_kaipoke_cs_id:
            params.resolvedTarget?.kaipoke_cs_id ??
            params.pending.target_kaipoke_cs_id,
        shift_date: shiftDate,
        start_time: null,
        end_time: null,
        service_code: null,
        target_shift_id: null,
        confirm_summary: null,
    });

    const sameDayShifts = await listShiftsOnDate({
        kaipokeCsId: patchedBase.target_kaipoke_cs_id,
        shiftDate,
    });

    const built = buildDeleteShiftCandidatesMessage({
        shiftDate,
        sameDayShifts,
    });

    if (sameDayShifts.length === 0) {
        await patchPending(params.sessionKey, {
            status: "cancelled",
            shift_date: null,
            start_time: null,
            end_time: null,
            service_code: null,
            target_shift_id: null,
            confirm_summary: null,
        });

        return jsonText(
            built.text,
            buildClearedSessionParams()
        );
    }

    if (built.autoSelectedShiftId) {
        await patchPending(params.sessionKey, {
            intent_name: "delete_shift",
            status: "confirming",
            shift_date: shiftDate,
            start_time: built.autoSelectedStartTime,
            end_time: built.autoSelectedEndTime,
            service_code: built.autoSelectedServiceCode,
            target_shift_id: built.autoSelectedShiftId,
            confirm_summary: built.confirmSummary,
        });

        return jsonText(built.text, {
            operation_type: "delete",
            shift_date: shiftDate,
            start_time: built.autoSelectedStartTime,
            end_time: built.autoSelectedEndTime,
            service_code: built.autoSelectedServiceCode,
            target_shift_id: built.autoSelectedShiftId,
            confirm_summary: built.confirmSummary,
        }, "delete");
    }

    return jsonText(built.text, {
        operation_type: "delete",
        shift_date: shiftDate,
        start_time: null,
        end_time: null,
        service_code: null,
        target_shift_id: null,
        confirm_summary: null,
    });
}

async function handleDeleteShift(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
    resolvedTarget: ResolvedTarget;
}) {
    const shiftDate =
        normalizeDate(params.dialogflowParams.shift_date) ??
        params.pending.shift_date ??
        null;

    const sourceMessage =
        params.pending.last_message ??
        normalizeString(params.dialogflowParams.original_message) ??
        null;

    const startTime =
        normalizeTimeForCreate(params.dialogflowParams.start_time, sourceMessage) ??
        normalizeTimeForCreate(params.dialogflowParams.date_time, sourceMessage) ??
        params.pending.start_time ??
        null;
    if (!shiftDate) {
        return jsonText("いつのシフトですか？", {
            operation_type: "delete",
            shift_date: null,
            start_time: null,
            target_shift_id: null,
            confirm_summary: null,
        }, "delete");
    }

    if (!startTime) {
        return jsonText("何時開始のシフトですか？", {
            operation_type: "delete",
            shift_date: shiftDate,
            start_time: null,
            target_shift_id: null,
            confirm_summary: null,
        }, "delete");
    }

    const base = await patchPending(params.sessionKey, {
        intent_name: "delete_shift",
        status: "collecting",
        target_kaipoke_cs_id:
            params.resolvedTarget?.kaipoke_cs_id ??
            params.pending.target_kaipoke_cs_id,
        shift_date: shiftDate,
        start_time: startTime,
        target_shift_id: null,
        confirm_summary: null,
    });

    const ensured = await ensureTargetShiftForOperation(params.sessionKey, base, {
        mode: "delete",
    });
    if (!ensured.ok) return ensured.response;

    const patched = ensured.patched;

    const summary = [
        "次のシフトを削除してよいですか？",
        `日付: ${patched.shift_date ?? "未指定"}`,
        `開始: ${patched.start_time ?? "未指定"}`,
        `終了: ${patched.end_time ?? "未指定"}`,
        `サービス: ${patched.service_code ?? "未指定"}`,
        "",
        "よろしければ「はい」、やめるなら「いいえ」と入力してください。",
    ].join("\n");

    await patchPending(params.sessionKey, {
        intent_name: "delete_shift",
        status: "confirming",
        confirm_summary: summary,
    });

    return jsonText(summary, {
        operation_type: "delete",
        shift_date: patched.shift_date,
        start_time: patched.start_time,
        end_time: patched.end_time,
        service_code: patched.service_code,
        target_shift_id: patched.target_shift_id,
        confirm_summary: summary,
    });
}

async function handleStaffUnavailable(params: {
    sessionKey: string;
    pending: PendingRow;
    dialogflowParams: DialogflowParams;
    resolvedTarget: ResolvedTarget;
    resolvedStaff: ResolvedStaff;
}) {
    const shiftDate = normalizeDate(params.dialogflowParams.shift_date) ?? params.pending.shift_date ?? null;
    const startTime =
        normalizeTime(params.dialogflowParams.start_time) ??
        normalizeTime(params.dialogflowParams.date_time) ??
        params.pending.start_time ??
        null;

    const base = await patchPending(params.sessionKey, {
        intent_name: "staff_unavailable",
        target_kaipoke_cs_id: params.resolvedTarget?.kaipoke_cs_id ?? params.pending.target_kaipoke_cs_id,
        shift_date: shiftDate,
        start_time: startTime,
        status: "collecting",
    });

    const ensured = await ensureTargetShiftForOperation(params.sessionKey, base);
    if (!ensured.ok) return ensured.response;

    const targetShift = ensured.targetShift;
    const requesterUserId = params.resolvedStaff.requesterUserId;

    let staffPosition: "primary" | "second" | "third" | null = null;
    if (requesterUserId && targetShift.staff_01_user_id === requesterUserId) staffPosition = "primary";
    if (requesterUserId && targetShift.staff_02_user_id === requesterUserId) staffPosition = "second";
    if (requesterUserId && targetShift.staff_03_user_id === requesterUserId) staffPosition = "third";

    const summary = [
        "担当不可として記録します。",
        `shift_id: ${targetShift.shift_id}`,
        `日付: ${normalizeDate(targetShift.shift_start_date) ?? "未指定"}`,
        `時間: ${normalizeTime(targetShift.shift_start_time) ?? "未指定"}-${normalizeTime(targetShift.shift_end_time) ?? "未指定"}`,
        `申告者: ${requesterUserId ?? "未特定"}`,
        `該当ポジション: ${staffPosition ?? "未特定"}`,
        "この処理ではサービス自体は削除しません。",
        "この内容でよいですか？",
    ].join("\n");

    const patched = await patchPending(params.sessionKey, {
        intent_name: "staff_unavailable",
        target_shift_id: targetShift.shift_id,
        confirm_summary: summary,
        status: "confirming",
    });

    return jsonText(patched.confirm_summary ?? summary);
}

async function handleConfirmYes(params: { sessionKey: string; pending: PendingRow }) {
    const pending = params.pending;

    if (pending.intent_name === "create_shift") {
        const missing = requiredMissing({
            targetKaipokeCsId: pending.target_kaipoke_cs_id,
            shiftDate: pending.shift_date,
            startTime: pending.start_time,
            endTime: pending.end_time,
            serviceCode: pending.service_code,
            staff01UserId: pending.staff_01_user_id,
        });

        if (missing.length > 0) {
            return jsonText(`まだ不足があります: ${missing.join("、")} を教えてください。`);
        }

        const insertPayload = {
            kaipoke_cs_id: pending.target_kaipoke_cs_id,
            shift_start_date: pending.shift_date,
            shift_start_time: pending.start_time,
            shift_end_date: pending.shift_date,
            shift_end_time: pending.end_time,
            service_code: pending.service_code,
            staff_01_user_id: pending.staff_01_user_id,
            staff_02_user_id: pending.staff_02_user_id,
            staff_03_user_id: pending.staff_03_user_id,
            staff_02_attend_flg: !!pending.staff_02_attend_flg,
            staff_03_attend_flg: !!pending.staff_03_attend_flg,
            required_staff_count: pending.required_staff_count ?? 1,
            two_person_work_flg: !!pending.two_person_work_flg,
            staff_01_role_code: "01",
            staff_02_role_code: pending.staff_02_user_id ? "02" : null,
            staff_03_role_code: pending.staff_03_user_id ? "02" : null,
            judo_ido: pending.judo_ido ?? "0000",
        };

        const existing = await findShiftByExactKey({
            kaipokeCsId: pending.target_kaipoke_cs_id,
            shiftDate: pending.shift_date,
            startTime: pending.start_time,
        });

        if (existing) {
            return jsonText(
                [
                    "同じ利用者・日付・開始時刻のシフトが既にあります。",
                    `日付: ${pending.shift_date ?? "未指定"}`,
                    `開始: ${pending.start_time ?? "未指定"}`,
                    `既存サービス: ${existing.service_code ?? "未指定"}`,
                    "追加ではなく、削除または更新として扱う必要がある可能性があります。",
                ].join("\n"),
                undefined,
                "common"
            );
        }

        const { data, error } = await supabaseAdmin
            .from("shift")
            .insert(insertPayload)
            .select("shift_id")
            .single();

        if (error) {
            console.error("[dialogflow webhook] shift insert error", error);
            return jsonText(`登録に失敗しました。${error.message}`, undefined, "create");
        }

        await patchPending(params.sessionKey, {
            status: "completed",
            target_shift_id: data?.shift_id ?? null,
        });

        return jsonText(`登録しました。shift_id=${data?.shift_id ?? "不明"}`, buildClearedSessionParams(), "create");
    }

    if (pending.intent_name === "update_shift") {
        const targetShift = await loadTargetShiftFromPending(pending);
        if (!targetShift) {
            return jsonText("更新対象シフトを特定できませんでした。");
        }

        const updatePayload = {
            shift_start_date: pending.shift_date,
            shift_start_time: pending.start_time,
            shift_end_date: pending.shift_date,
            shift_end_time: pending.end_time,
            service_code: pending.service_code,
            staff_01_user_id: pending.staff_01_user_id,
            staff_02_user_id: pending.staff_02_user_id,
            staff_03_user_id: pending.staff_03_user_id,
            staff_02_attend_flg: !!pending.staff_02_attend_flg,
            staff_03_attend_flg: !!pending.staff_03_attend_flg,
            required_staff_count: pending.required_staff_count ?? 1,
            two_person_work_flg: !!pending.two_person_work_flg,
            staff_01_role_code: "01",
            staff_02_role_code: pending.staff_02_user_id ? "02" : null,
            staff_03_role_code: pending.staff_03_user_id ? "02" : null,
            judo_ido: pending.judo_ido ?? "0000",
        };

        const { error } = await supabaseAdmin
            .from("shift")
            .update(updatePayload)
            .eq("shift_id", targetShift.shift_id);

        if (error) {
            console.error("[dialogflow webhook] shift update error", error);
            return jsonText(`更新に失敗しました。${error.message}`);
        }

        await patchPending(params.sessionKey, {
            status: "completed",
        });

        return jsonText(`更新しました。shift_id=${targetShift.shift_id}`);
    }

    if (pending.intent_name === "delete_shift") {
        const targetShift = await loadTargetShiftFromPending(pending);
        if (!targetShift) {
            return jsonText("削除対象シフトを特定できませんでした。");
        }

        const { error } = await supabaseAdmin
            .from("shift")
            .delete()
            .eq("shift_id", targetShift.shift_id);

        if (error) {
            console.error("[dialogflow webhook] shift delete error", error);
            return jsonText(`削除に失敗しました。${error.message}`);
        }

        await patchPending(params.sessionKey, {
            status: "completed",
        });

        return jsonText(
            [
                "次のシフトを削除しました。",
                `日付: ${pending.shift_date ?? "未指定"}`,
                `開始: ${pending.start_time ?? "未指定"}`,
                `終了: ${pending.end_time ?? "未指定"}`,
                `サービス: ${pending.service_code ?? "未指定"}`,
            ].join("\n"),
            buildClearedSessionParams()
        );
    }

    if (pending.intent_name === "staff_unavailable") {
        const targetShift = await loadTargetShiftFromPending(pending);
        if (!targetShift) {
            return jsonText("対象シフトを特定できませんでした。");
        }

        const requesterUserId = pending.requester_user_id;
        let patch: Record<string, unknown> = {};

        if (requesterUserId && targetShift.staff_01_user_id === requesterUserId) {
            patch = {
                staff_01_user_id: null,
            };
        } else if (requesterUserId && targetShift.staff_02_user_id === requesterUserId) {
            patch = {
                staff_02_user_id: null,
                staff_02_attend_flg: false,
            };
        } else if (requesterUserId && targetShift.staff_03_user_id === requesterUserId) {
            patch = {
                staff_03_user_id: null,
                staff_03_attend_flg: false,
            };
        } else {
            return jsonText("申告者が対象シフトの担当者として見つかりませんでした。");
        }

        const { error } = await supabaseAdmin
            .from("shift")
            .update(patch)
            .eq("shift_id", targetShift.shift_id);

        if (error) {
            console.error("[dialogflow webhook] staff unavailable update error", error);
            return jsonText(`担当不可の反映に失敗しました。${error.message}`);
        }

        await patchPending(params.sessionKey, {
            status: "completed",
        });

        return jsonText(`担当不可として反映しました。shift_id=${targetShift.shift_id}`);
    }

    return jsonText("現在、確定できる処理がありません。");
}

async function handleConfirmNo(params: { sessionKey: string }) {
    await patchPending(params.sessionKey, {
        status: "cancelled",
    });

    return jsonText(
        "この依頼は取り消しました。",
        buildClearedSessionParams()
    );
}
export async function POST(req: NextRequest) {
    try {
        const secret = req.headers.get("x-dialogflow-secret");
        if (secret !== process.env.DIALOGFLOW_WEBHOOK_SECRET) {
            return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        }

        const body = (await req.json()) as Record<string, unknown>;

        const fulfillmentInfo = body.fulfillmentInfo as Record<string, unknown> | undefined;
        const intentInfo = body.intentInfo as Record<string, unknown> | undefined;
        const sessionInfo = body.sessionInfo as Record<string, unknown> | undefined;
        const sessionParams = (sessionInfo?.parameters ?? {}) as Record<string, unknown>;

        console.info("[dialogflow webhook] routing debug", {
            tag: normalizeString(fulfillmentInfo?.tag),
            displayName: normalizeString(intentInfo?.displayName),
            lastMatchedIntent: normalizeString(intentInfo?.lastMatchedIntent),
            sessionParams,
        });

        console.info(
            "[dialogflow webhook] session params raw",
            JSON.stringify(
                ((body.sessionInfo as Record<string, unknown> | undefined)?.parameters ?? {}),
                null,
                2
            )
        );

        const dialogflowParams = ((body.sessionInfo as Record<string, unknown> | undefined)?.parameters ?? {}) as DialogflowParams;

        const channelId = normalizeString(dialogflowParams.channel_id);
        const requesterLwUserid = normalizeString(dialogflowParams.requester_lw_userid);
        let mentionLwUserids = asStringArray(dialogflowParams.mention_lw_userids);
        const sourceMessage =
            normalizeString(dialogflowParams.original_message) ??
            extractOriginalText(body);

        if (!channelId) {
            return jsonText("channel_id が取得できませんでした。");
        }

        if (mentionLwUserids.length === 0) {
            mentionLwUserids = await findRecentMentionLwUseridsFromLog({
                channelId,
                requesterLwUserid,
                sourceMessage,
            });
        }

        const sessionKey = buildSessionKey(channelId, requesterLwUserid);

        const currentPendingRaw = await getPendingBySessionKey(sessionKey);

        const currentPending =
            currentPendingRaw && !isExpired(currentPendingRaw.expires_at)
                ? currentPendingRaw
                : null;

        if (currentPendingRaw && isExpired(currentPendingRaw.expires_at)) {
            await patchPending(sessionKey, {
                status: "cancelled",
            });

            return jsonText(
                "前回の操作は期限切れになりました。もう一度最初からお願いします。",
                buildClearedSessionParams()
            );
        }

        const detectedIntentName = extractIntentName(body);
        let initialIntentName: string | null = detectedIntentName;
        let initialAiDecision: InitialOperationDecision | null = null;

        if (!currentPending) {
            initialAiDecision = sourceMessage
                ? await classifyInitialOperationWithOpenAI(sourceMessage)
                : null;

            const mappedDialogflowOperation =
                mapDialogflowIntentToInitialOperation(detectedIntentName);

            console.info("[dialogflow webhook] initial operation decision", {
                detectedIntentName,
                mappedDialogflowOperation,
                aiDecision: initialAiDecision,
                sourceMessage,
            });

            if (initialAiDecision?.operation && initialAiDecision.operation !== "unknown") {
                initialIntentName = initialAiDecision.operation;
            } else if (mappedDialogflowOperation) {
                initialIntentName = mappedDialogflowOperation;
            } else if (isAllowedInitialIntent(detectedIntentName)) {
                initialIntentName = detectedIntentName;
            } else {
                initialIntentName = null;
            }
        }

        if (!currentPending && !initialIntentName) {
            console.info("[dialogflow webhook] no actionable operation; ignore", {
                sourceMessage,
                detectedIntentName,
                aiDecision: initialAiDecision,
            });

            return jsonNoReply();
        }

        const resolvedTarget = await resolveTargetFromChannel(channelId);
        const resolvedStaff = await resolveStaffUsers({
            requesterLwUserid,
            mentionLwUserids,
            staffName: normalizeString(dialogflowParams.staff_name),
        });

        console.info("[dialogflow webhook] mention lookup", {
            requester_lw_userid: requesterLwUserid,
            source_message: sourceMessage,
            staff_name_raw: normalizeString(dialogflowParams.staff_name),
            mention_lw_userids_from_dialogflow: asStringArray(dialogflowParams.mention_lw_userids),
            mention_lw_userids_final: mentionLwUserids,
            mention_resolved_user_ids: resolvedStaff.mentionResolvedUserIds,
            mention_primary_user_id: resolvedStaff.mentionPrimaryUserId,
            staff_name_resolved_user_id: resolvedStaff.staffNameResolvedUserId,
        });

        if (currentPendingRaw && isExpired(currentPendingRaw.expires_at)) {
            await patchPending(sessionKey, {
                status: "cancelled",
            });

            return jsonText(
                "前回の操作は期限切れになりました。もう一度最初からお願いします。",
                buildClearedSessionParams()
            );
        }

        const incomingIntentName = initialIntentName;
        let effectiveIntentName = incomingIntentName;
        const lockedOperation = currentPending?.intent_name ?? null;

        if (lockedOperation) {
            if (isAllowedFollowupForLockedOperation(lockedOperation, incomingIntentName)) {
                effectiveIntentName = incomingIntentName;
            } else {
                effectiveIntentName = lockedOperation;
            }
        } else {
            const mappedInitialOperation = mapDialogflowIntentToInitialOperation(incomingIntentName);
            if (mappedInitialOperation) {
                effectiveIntentName = mappedInitialOperation;
            }
        }

        const pending = currentPending
            ? await patchPending(sessionKey, {
                last_message: sourceMessage,
                raw_dialogflow: body,
                mentioned_lw_userids: mentionLwUserids,
            })
            : await upsertPendingBase({
                sessionKey,
                channelId,
                requesterLwUserid,
                requesterUserId: resolvedStaff.requesterUserId,
                targetKaipokeCsId: resolvedTarget?.kaipoke_cs_id ?? null,
                mentionLwUserids,
                sourceMessage,
                rawDialogflow: body,
            });

        if (!resolvedTarget?.kaipoke_cs_id) {
            return jsonText("このグループから利用者を特定できませんでした。");
        }

        if (!lockedOperation && !isAllowedInitialIntent(effectiveIntentName)) {
            return jsonText(
                "依頼内容の判定が不安定でした。追加・削除・更新・担当不可のどれかをもう一度お願いします。",
                buildClearedSessionParams()
            );
        }

        switch (effectiveIntentName) {
            case "delete_shift_date_ready":
                return await handleDeleteShiftDateReady({
                    sessionKey,
                    pending,
                    dialogflowParams,
                    resolvedTarget,
                });
            case "create_shift":
                return await handleCreateShift({
                    sessionKey,
                    pending,
                    dialogflowParams,
                    resolvedTarget,
                    resolvedStaff,
                });

            case "create_shift_missing_ready":
                return await handleCreateShiftMissingReady({
                    sessionKey,
                    pending,
                    dialogflowParams,
                    resolvedTarget,
                    resolvedStaff,
                });


            case "update_shift":
                return await handleUpdateShift({
                    sessionKey,
                    pending,
                    dialogflowParams,
                    resolvedTarget,
                    resolvedStaff,
                });

            case "delete_shift":
                return await handleDeleteShift({
                    sessionKey,
                    pending,
                    dialogflowParams,
                    resolvedTarget,
                });

            case "staff_unavailable":
                return await handleStaffUnavailable({
                    sessionKey,
                    pending,
                    dialogflowParams,
                    resolvedTarget,
                    resolvedStaff,
                });

            case "correct_staff":
                return await handleCorrectStaff({
                    sessionKey,
                    pending,
                    dialogflowParams,
                    resolvedStaff,
                });

            case "correct_time":
                return await handleCorrectTime({
                    sessionKey,
                    pending,
                    dialogflowParams,
                    resolvedTarget,
                });

            case "correct_service_code":
                return await handleCorrectServiceCode({
                    sessionKey,
                    pending,
                    dialogflowParams,
                });

            case "set_second_staff":
                return await handleSetSecondStaff({
                    sessionKey,
                    pending,
                    resolvedStaff,
                });

            case "set_third_staff":
                return await handleSetThirdStaff({
                    sessionKey,
                    pending,
                    resolvedStaff,
                });

            case "set_support_structure":
                return await handleSetSupportStructure({
                    sessionKey,
                    pending,
                    dialogflowParams,
                });

            case "confirm_yes":
                return await handleConfirmYes({
                    sessionKey,
                    pending,
                });

            case "confirm_no":
                return await handleConfirmNo({
                    sessionKey,
                });

            default:
                return jsonText(
                    "内容を理解できませんでした。シフト追加・修正・削除・担当変更・確認のいずれかとして入力してください。",
                    undefined,
                    "common"
                );
        }
    } catch (error) {
        console.error("[dialogflow webhook] unexpected error", error);
        return jsonText("処理中にエラーが発生しました。");
    }
}