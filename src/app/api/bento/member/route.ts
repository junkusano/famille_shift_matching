import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

type AppUser = {
    user_id: string | null;
    system_role: string | null;
    org_unit_id: string | null;
    status: string | null;
    entry_date_latest: string | null;
};

type SurveyRow = {
    id: string;
    title: string;
    description: string | null;
    notes: string | null;
    event_date: string;
    response_deadline: string;
    allow_edit_after_submit: boolean;
    status: string;
};

type NotesPayload = {
    noticeText: string;
    options: string[];
};

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (
        isRecord(error) &&
        typeof error.message === "string"
    ) {
        return error.message;
    }

    return "予期しないエラーが発生しました";
}

function monthRange(dateText: string) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateText);
    if (!match) throw new Error("invalid event_date");

    const year = Number(match[1]);
    const month = Number(match[2]);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;

    return {
        monthKey: `${year}-${String(month).padStart(2, "0")}`,
        fromDate: `${year}-${String(month).padStart(2, "0")}-01`,
        toDate: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    };
}

function parseNotes(value: string | null): NotesPayload {
    if (!value) return { noticeText: "", options: [] };

    try {
        const parsed: unknown = JSON.parse(value);
        if (!isRecord(parsed)) return { noticeText: value, options: [] };

        return {
            noticeText:
                typeof parsed.noticeText === "string" ? parsed.noticeText : "",
            options: Array.isArray(parsed.options)
                ? parsed.options.filter(
                    (item): item is string => typeof item === "string",
                )
                : [],
        };
    } catch {
        return { noticeText: value, options: [] };
    }
}

async function readLoginUser(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user) throw new Error("unauthorized");

    const { data, error } = await supabaseAdmin
        .from("users")
        .select(
            "user_id,system_role,org_unit_id,status,entry_date_latest"
        )
        .eq("auth_user_id", user.id)
        .maybeSingle<AppUser>();

    if (error) throw error;
    if (!data?.user_id) throw new Error("ログインユーザー情報が見つかりません");

    const role = String(data.system_role ?? "")
        .trim()
        .toUpperCase();
    if (!["MEMBER", "MANAGER", "ADMIN", "FULL"].includes(role)) {
        throw new Error("この画面を利用できる権限ではありません");
    }

    return {
        authUserId: user.id,
        userId: String(data.user_id),
        role,
        orgUnitId: String(data.org_unit_id ?? ""),
        status: String(data.status ?? ""),
        entryDate: data.entry_date_latest,
    };
}

async function checkEligibility(
    loginUser: Awaited<ReturnType<typeof readLoginUser>>,
    survey: SurveyRow,
) {
    const { monthKey, fromDate, toDate } = monthRange(survey.event_date);
    const targetMonth = `${monthKey}-01`;

    const status = loginUser.status.toLowerCase();

    if (status.startsWith("removed")) {
        return {
            eligible: false,
            reason: "退職・無効ユーザーのため回答できません。",
            isEntryMonth: false,
            hasShift: false,
            isMeetingMember: false,
        };
    }

    // 管理者は確認用として常に回答可能
    if (loginUser.role === "ADMIN" || loginUser.role === "FULL") {
        return {
            eligible: true,
            reason: "管理者確認のため回答できます。",
            isEntryMonth: false,
            hasShift: false,
            isMeetingMember: true,
        };
    }

    /*
     * 1. 会議対象者か確認
     */
    const { data: meetingRow, error: meetingError } = await supabaseAdmin
        .from("monthly_meeting_attendance")
        .select("user_id,required")
        .eq("target_month", targetMonth)
        .eq("user_id", loginUser.userId)
        .maybeSingle<{
            user_id: string;
            required: boolean | null;
        }>();

    if (meetingError) {
        throw meetingError;
    }

    const isMeetingMember =
        meetingRow !== null &&
        meetingRow.required !== false;

    /*
     * 2. 配布月がエントリー月か確認
     *
     * loginUser.entryDateには users.entry_date_latest を使用します。
     */
    const entryMonthKey = loginUser.entryDate
        ? loginUser.entryDate.slice(0, 7)
        : null;

    const isEntryMonth = entryMonthKey === monthKey;

    /*
     * 3. 配布月にシフトがあるか確認
     */
    const { data: shifts, error: shiftError } = await supabaseAdmin
        .from("shift")
        .select("shift_id")
        .gte("shift_start_date", fromDate)
        .lt("shift_start_date", toDate)
        .or(
            [
                `staff_01_user_id.eq.${loginUser.userId}`,
                `staff_02_user_id.eq.${loginUser.userId}`,
                `staff_03_user_id.eq.${loginUser.userId}`,
            ].join(","),
        )
        .limit(1);

    if (shiftError) {
        throw shiftError;
    }

    const hasShift = (shifts?.length ?? 0) > 0;

    /*
     * 最終判定
     *
     * ・会議対象者
     * ・エントリー月
     * ・エントリー翌月以降で、配布月にシフトあり
     */
    const eligible =
        isMeetingMember ||
        isEntryMonth ||
        hasShift;

    let reason: string;

    if (isMeetingMember) {
        reason = "対象月の会議対象者のため回答できます。";
    } else if (isEntryMonth) {
        reason =
            "エントリー月のため、対象月にシフトがなくても回答できます。";
    } else if (hasShift) {
        reason =
            "対象月にシフトが登録されているため回答できます。";
    } else {
        reason =
            "会議対象者ではなく、エントリー月でもなく、対象月のシフトもないため回答できません。";
    }

    return {
        eligible,
        reason,
        isEntryMonth,
        hasShift,
        isMeetingMember,
    };
}

export async function GET(req: NextRequest) {
    try {
        const loginUser = await readLoginUser(req);
        const surveyId = req.nextUrl.searchParams.get("survey_id");

        let surveyQuery = supabaseAdmin
            .from("bento_surveys")
            .select(
                "id,title,description,notes,event_date,response_deadline,allow_edit_after_submit,status",
            )
            .eq("is_active", true)
            .eq("status", "published");

        if (surveyId) {
            surveyQuery = surveyQuery.eq("id", surveyId);
        } else {
            surveyQuery = surveyQuery
                .gte("response_deadline", new Date().toISOString())
                .order("event_date", { ascending: true })
                .limit(1);
        }

        const { data: surveyData, error: surveyError } =
            await surveyQuery.maybeSingle<SurveyRow>();

        if (surveyError) throw surveyError;
        if (!surveyData) {
            return json({
                ok: true,
                survey: null,
                message: "現在回答できるアンケートはありません。",
            });
        }

        const [menuResult, locationResult, responseResult, eligibility] =
            await Promise.all([
                supabaseAdmin
                    .from("bento_survey_menus")
                    .select("id,name,description,image_url,sort_order")
                    .eq("survey_id", surveyData.id)
                    .eq("is_active", true)
                    .order("sort_order", { ascending: true }),
                supabaseAdmin
                    .from("bento_pickup_locations")
                    .select("id,name,sort_order")
                    .eq("is_active", true)
                    .order("sort_order", { ascending: true }),
                supabaseAdmin
                    .from("bento_survey_responses")
                    .select(
                        "id,menu_id,pickup_location_id,option_text,submitted_at,updated_at,received_at",
                    )
                    .eq("survey_id", surveyData.id)
                    .eq("user_id", loginUser.userId)
                    .maybeSingle(),
                checkEligibility(loginUser, surveyData),
            ]);

        if (menuResult.error) throw menuResult.error;
        if (locationResult.error) throw locationResult.error;
        if (responseResult.error) throw responseResult.error;

        const deadlinePassed =
            new Date(surveyData.response_deadline).getTime() <= Date.now();
        const response = responseResult.data;
        const canEdit =
            eligibility.eligible &&
            !deadlinePassed &&
            (!response || surveyData.allow_edit_after_submit);

        return json({
            ok: true,
            role: loginUser.role,
            user_id: loginUser.userId,
            survey: {
                ...surveyData,
                notes_payload: parseNotes(surveyData.notes),
            },
            menus: menuResult.data ?? [],
            pickup_locations: locationResult.data ?? [],
            response,
            eligibility,
            deadline_passed: deadlinePassed,
            can_edit: canEdit,
        });
    } catch (error: unknown) {
        console.error("[bento/member][GET]", error);

        const message = getErrorMessage(error);

        return json(
            { ok: false, error: message },
            message === "unauthorized" ? 401 : 500,
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const loginUser = await readLoginUser(req);
        const body: unknown = await req.json();
        if (!isRecord(body)) return json({ ok: false, error: "invalid body" }, 400);

        const surveyId = typeof body.survey_id === "string" ? body.survey_id : "";
        const menuId = typeof body.menu_id === "string" ? body.menu_id : "";
        const pickupLocationId =
            typeof body.pickup_location_id === "string"
                ? body.pickup_location_id
                : "";
        const optionText =
            typeof body.option_text === "string" ? body.option_text.trim() : "";

        if (!surveyId || !menuId || !pickupLocationId) {
            return json(
                {
                    ok: false,
                    error: "survey_id、menu_id、pickup_location_id は必須です",
                },
                400,
            );
        }

        const { data: survey, error: surveyError } = await supabaseAdmin
            .from("bento_surveys")
            .select(
                "id,title,description,notes,event_date,response_deadline,allow_edit_after_submit,status",
            )
            .eq("id", surveyId)
            .eq("is_active", true)
            .maybeSingle<SurveyRow>();

        if (surveyError) throw surveyError;
        if (!survey || survey.status !== "published") {
            return json({ ok: false, error: "アンケートは公開されていません" }, 400);
        }

        if (new Date(survey.response_deadline).getTime() <= Date.now()) {
            return json({ ok: false, error: "回答期限を過ぎています" }, 400);
        }

        const eligibility = await checkEligibility(loginUser, survey);
        if (!eligibility.eligible) {
            return json({ ok: false, error: eligibility.reason }, 403);
        }

        const notes = parseNotes(survey.notes);
        if (optionText && !notes.options.includes(optionText)) {
            return json({ ok: false, error: "無効なオプションです" }, 400);
        }

        const [menuResult, locationResult, currentResult] = await Promise.all([
            supabaseAdmin
                .from("bento_survey_menus")
                .select("id")
                .eq("id", menuId)
                .eq("survey_id", surveyId)
                .eq("is_active", true)
                .maybeSingle(),
            supabaseAdmin
                .from("bento_pickup_locations")
                .select("id")
                .eq("id", pickupLocationId)
                .eq("is_active", true)
                .maybeSingle(),
            supabaseAdmin
                .from("bento_survey_responses")
                .select("id")
                .eq("survey_id", surveyId)
                .eq("user_id", loginUser.userId)
                .maybeSingle(),
        ]);

        if (menuResult.error) throw menuResult.error;
        if (locationResult.error) throw locationResult.error;
        if (currentResult.error) throw currentResult.error;
        if (!menuResult.data)
            return json({ ok: false, error: "選択したメニューが無効です" }, 400);
        if (!locationResult.data)
            return json({ ok: false, error: "選択した受取場所が無効です" }, 400);

        if (currentResult.data && !survey.allow_edit_after_submit) {
            return json({ ok: false, error: "回答後の変更はできません" }, 400);
        }

        const now = new Date().toISOString();
        const { data: saved, error: saveError } = await supabaseAdmin
            .from("bento_survey_responses")
            .upsert(
                {
                    survey_id: surveyId,
                    user_id: loginUser.userId,
                    menu_id: menuId,
                    pickup_location_id: pickupLocationId,
                    option_text: optionText || null,
                    submitted_at: currentResult.data ? undefined : now,
                    updated_at: now,
                },
                { onConflict: "survey_id,user_id" },
            )
            .select(
                "id,menu_id,pickup_location_id,option_text,submitted_at,updated_at,received_at",
            )
            .single();

        if (saveError) throw saveError;

        return json({ ok: true, response: saved });
    } catch (error: unknown) {
        console.error("[bento/member][POST]", error);

        const message = getErrorMessage(error);

        return json(
            { ok: false, error: message },
            message === "unauthorized" ? 401 : 500,
        );
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const loginUser = await readLoginUser(req);

        const body: unknown = await req.json();

        if (!isRecord(body)) {
            return json(
                {
                    ok: false,
                    error: "送信内容が正しくありません。",
                },
                400,
            );
        }

        const action =
            typeof body.action === "string"
                ? body.action
                : "";

        const surveyId =
            typeof body.survey_id === "string"
                ? body.survey_id
                : "";

        if (action !== "mark_received") {
            return json(
                {
                    ok: false,
                    error: "操作内容が正しくありません。",
                },
                400,
            );
        }

        if (!surveyId) {
            return json(
                {
                    ok: false,
                    error: "アンケートIDがありません。",
                },
                400,
            );
        }

        const { data: existingResponse, error: responseError } =
            await supabaseAdmin
                .from("bento_survey_responses")
                .select("id,received_at")
                .eq("survey_id", surveyId)
                .eq("user_id", loginUser.userId)
                .maybeSingle<{
                    id: string;
                    received_at: string | null;
                }>();

        if (responseError) {
            throw responseError;
        }

        if (!existingResponse) {
            return json(
                {
                    ok: false,
                    error: "先にアンケートへ回答してください。",
                },
                400,
            );
        }

        if (existingResponse.received_at) {
            return json({
                ok: true,
                received_at: existingResponse.received_at,
                message: "すでに受取済みです。",
            });
        }

        const receivedAt = new Date().toISOString();

        const { error: updateError } = await supabaseAdmin
            .from("bento_survey_responses")
            .update({
                received_at: receivedAt,
                updated_at: receivedAt,
            })
            .eq("id", existingResponse.id);

        if (updateError) {
            throw updateError;
        }

        return json({
            ok: true,
            received_at: receivedAt,
            message: "受取済みとして保存しました。",
        });
    } catch (error: unknown) {
        console.error("[bento/member][PATCH]", error);

        const message = getErrorMessage(error);

        return json(
            {
                ok: false,
                error: message,
            },
            message === "unauthorized" ? 401 : 500,
        );
    }
}