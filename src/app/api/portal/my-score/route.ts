//api/portal/my-score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

/*type ShiftRow = {
    shift_id: number;
    shift_start_date: string;
    shift_start_time: string | null;
    shift_end_time: string | null;
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
};

type ShiftRecordRow = {
    shift_id: number;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
};

type MeetingAttendanceRow = {
    required: boolean | null;
    attended_regular: boolean | null;
    attended_extra: boolean | null;
    checked_regular: boolean | null;
    checked_extra: boolean | null;
    updated_at: string | null;
};*/

/*type DisabilityCheckRow = {
    is_checked: boolean | null;
    application_check: boolean | null;
    asigned_jisseki_staff_id: string | null;
};

type GoalRow = {
    id: string;
    selected: boolean | null;
    watched: boolean | null;
};*/

type UserRow = {
    user_id: string;
    entry_id: string | null;
    auth_uid: string;
    status: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    last_name_kana: string | null;
    first_name_kana: string | null;
};

type MemberOption = {
    user_id: string;
    entry_id: string | null;
    status: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    last_name_kana: string | null;
    first_name_kana: string | null;
};

/*type Metric = {
    key: string;
    label: string;
    score: number;
    maxScore: number;
    note: string;
};

function isValidYearMonth(value: string | null) {
    return value !== null && /^\d{4}-\d{2}$/.test(value);
}*/

/*function getMonthRange(monthParam: string | null) {
    const now = new Date();

    const ym = isValidYearMonth(monthParam)
        ? monthParam
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [yearText, monthText] = ym.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;

    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 1);

    return {
        ym,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    };
}*/

/*function getPreviousYm(ym: string) {
    const [yearText, monthText] = ym.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;

    const d = new Date(year, monthIndex - 1, 1);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function calcMeetingScore(meeting: MeetingAttendanceRow | null | undefined, displayYm: string) {
    const meetingRequired = meeting?.required !== false;

    if (!meetingRequired) {
        return {
            meetingRequired,
            meetingScore: 100,
            note: "対象外",
        };
    }

    if (meeting?.attended_regular === true) {
        return {
            meetingRequired,
            meetingScore: 100,
            note: "前月の月例参加あり",
        };
    }

    if (meeting?.attended_extra === true) {
        const [yearText, monthText] = displayYm.split("-");
        const deadline = `${yearText}-${monthText}-10`;
        const checkedDate = String(meeting.updated_at ?? "").slice(0, 10);

        return {
            meetingRequired,
            meetingScore: checkedDate && checkedDate <= deadline ? 100 : 50,
            note:
                checkedDate && checkedDate <= deadline
                    ? "前月会議の追加開催あり（10日まで）"
                    : "前月会議の追加開催あり（11日以降のため5点）",
        };
    }

    return {
        meetingRequired,
        meetingScore: 0,
        note: "前月会議未参加",
    };
}*/

function buildMonthOptions(count: number) {
    const now = new Date();

    return Array.from({ length: count }, (_, index) => {
        const d = new Date(now.getFullYear(), now.getMonth() - index, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

        return {
            value: ym,
            label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
        };
    });
}

/*function buildRecentMonthsByYm(baseYm: string, count: number) {
    const [yearText, monthText] = baseYm.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;

    return Array.from({ length: count }, (_, index) => {
        const d = new Date(year, monthIndex - (count - 1 - index), 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

        return {
            value: ym,
            label: `${d.getMonth() + 1}月`,
        };
    });
}

function calcMinutes(
    date: string,
    start?: string | null,
    end?: string | null
) {
    if (!start || !end) return 0;

    const s = new Date(`${date}T${start}`);
    const e = new Date(`${date}T${end}`);

    const diff = e.getTime() - s.getTime();

    return diff > 0 ? Math.round(diff / 60000) : 0;
}*/

function getBadge(score: number) {
    if (score >= 100) return "プラチナ";
    if (score >= 80) return "ゴールド";
    if (score >= 60) return "シルバー";
    if (score < 60) return "ブロンズ";
}

type ScoreRow = {
    service_hours: number | string | null;
    visit_record_total_count: number | null;
    houmon_same_day_done_count: number | null;
    visit_record_past_incomplete_count: number | null;
    meeting_previous_month_attended: boolean | null;
    meeting_past_attended: boolean | null;
    jisseki_previous_month_done_count: number | null;
    jisseki_past_incomplete_count: number | null;
    training_goal_selected_count: number | null;
    visit_record_current_month_incomplete_count: number | null;
};

function calcDisplayTotalScore(row: ScoreRow) {
    const serviceHoursScore = Math.min(
        80,
        Math.floor(Number(row.service_hours ?? 0) / 20) * 10
    );

    const visitRecordTotalCount = Number(row.visit_record_total_count ?? 0);

    const visitRecordCurrentMonthIncompleteCount = Number(
        row.visit_record_current_month_incomplete_count ?? 0
    );

    const visitRecordPastIncompleteCount = Number(
        row.visit_record_past_incomplete_count ?? 0
    );

    const visitRecordCompletedCount = Math.max(
        0,
        visitRecordTotalCount - visitRecordCurrentMonthIncompleteCount
    );

    const visitRecordBaseScore =
        visitRecordTotalCount > 0
            ? Math.round((visitRecordCompletedCount / visitRecordTotalCount) * 30)
            : 30;

    const visitRecordScore = Math.max(
        0,
        Math.min(30, visitRecordBaseScore - visitRecordPastIncompleteCount * 5)
    );

    const meetingScore =
        row.meeting_previous_month_attended === true ||
            row.meeting_past_attended === true
            ? 10
            : 0;

    const jissekiScore = Math.max(
        0,
        20 - Number(row.jisseki_past_incomplete_count ?? 0) * 5
    );

    const trainingGoalScore = Number(row.training_goal_selected_count ?? 0) * 5;

    return (
        serviceHoursScore +
        visitRecordScore +
        meetingScore +
        jissekiScore +
        trainingGoalScore
    );
}

/*const SCORE_WEIGHTS = {
    serviceHours: 80,
    visitRecord: 30,
    meeting: 10,
    jisseki: 30,
    trainingGoal: 0,
};*/

export async function GET(req: NextRequest) {
    const token = req.headers
        .get("authorization")
        ?.replace("Bearer ", "");

    if (!token) {
        return NextResponse.json(
            { error: "unauthorized" },
            { status: 401 }
        );
    }

    const { data: authData, error: authError } =
        await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
        return NextResponse.json(
            { error: "unauthorized" },
            { status: 401 }
        );
    }

    // const targetMonth =
    //   req.nextUrl.searchParams.get("ym") ??
    // req.nextUrl.searchParams.get("month");

    //const { ym, startDate, endDate } = getMonthRange(targetMonth);

    const targetUserId = req.nextUrl.searchParams.get("user_id");

    const now = new Date();
    const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const currentYm = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}`;

    const ym = req.nextUrl.searchParams.get("ym") ?? currentYm;
    const monthOptions = buildMonthOptions(24);

    const { data: loginUser, error: loginUserError } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select(
            `
            user_id,
            entry_id,
            auth_uid,
            status,
            last_name_kanji,
            first_name_kanji,
            last_name_kana,
            first_name_kana
            `
        )
        .eq("auth_uid", authData.user.id)
        .maybeSingle<UserRow>();

    if (loginUserError || !loginUser?.user_id) {
        return NextResponse.json(
            { error: "user not found" },
            { status: 404 }
        );
    }

    const { data: memberRows } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select(
            `
        user_id,
        entry_id,
        status,
        last_name_kanji,
        first_name_kanji,
        last_name_kana,
        first_name_kana
      `
        )
        .not("user_id", "is", null)
        .neq("status", "removed_from_lineworks_kaipoke")
        .order("last_name_kana", { ascending: true })
        .order("first_name_kana", { ascending: true })
        .returns<MemberOption[]>();

    const members = (memberRows ?? []).filter((member) => {
        return (
            Boolean(member.user_id) &&
            member.status !== "removed_from_lineworks_kaipoke"
        );
    });

    const selectedMember =
        targetUserId
            ? members.find((member) => member.user_id === targetUserId)
            : loginUser;

    const me = selectedMember ?? loginUser;

    const userId = me.user_id;
    //const entryId = me.entry_id;

    function addParams(path: string, params: Record<string, string | null | undefined>) {
        const qs = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value) qs.set(key, value);
        });

        return `${path}?${qs.toString()}`;
    }

    function getPreviousYm(ym: string) {
        const [yearText, monthText] = ym.split("-");
        const d = new Date(Number(yearText), Number(monthText) - 2, 1);

        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    const previousYm = getPreviousYm(ym);

    const targetMonthDate = `${ym}-01`;

    const { data: summary, error: summaryError } = await supabaseAdmin
        .from("staff_monthly_score_summaries")
        .select("*")
        .eq("target_month", targetMonthDate)
        .eq("user_id", userId)
        .maybeSingle();

    if (summaryError) {
        console.error(summaryError);
        return NextResponse.json(
            { error: summaryError.message },
            { status: 500 }
        );
    }

    if (!summary) {
        return NextResponse.json(
            { error: "score summary not found" },
            { status: 404 }
        );
    }

    const { data: rankingSourceRows } = await supabaseAdmin
        .from("staff_monthly_score_summaries")
        .select("*")
        .eq("target_month", targetMonthDate);

    let currentRankNo = 0;
    let previousScore: number | null = null;

    const rankingRows = (rankingSourceRows ?? [])
        .map((row) => ({
            user_id: row.user_id,
            staff_name: row.staff_name,
            score: calcDisplayTotalScore(row),
        }))
        .sort((a, b) => b.score - a.score)
        .map((row, index) => {
            if (previousScore === null || previousScore !== row.score) {
                currentRankNo = index + 1;
            }

            previousScore = row.score;

            return {
                ...row,
                rank_no: currentRankNo,
            };
        });

    const { data: historyRows } = await supabaseAdmin
        .from("staff_monthly_score_summaries")
        .select(`
            target_month,
            rank_no,
            service_hours,
            visit_record_total_count,
            houmon_same_day_done_count,
            visit_record_past_incomplete_count,
            meeting_previous_month_attended,
            meeting_past_attended,
            jisseki_previous_month_done_count,
            jisseki_past_incomplete_count,
            visit_record_current_month_incomplete_count,
            training_goal_selected_count
`)
        .eq("user_id", userId)
        .gte("target_month", "2026-05-01")
        .order("target_month", { ascending: true });

    const serviceHoursScore = Math.min(
        80,
        Math.floor(Number(summary.service_hours ?? 0) / 20) * 10
    );

    const visitRecordTotalCount = Number(summary.visit_record_total_count ?? 0);

    const visitRecordCurrentMonthIncompleteCount = Number(
        summary.visit_record_current_month_incomplete_count ?? 0
    );

    const visitRecordPastIncompleteCount = Number(
        summary.visit_record_past_incomplete_count ?? 0
    );

    const visitRecordCompletedCount = Math.max(
        0,
        visitRecordTotalCount - visitRecordCurrentMonthIncompleteCount
    );

    const visitRecordBaseScore =
        visitRecordTotalCount > 0
            ? Math.round((visitRecordCompletedCount / visitRecordTotalCount) * 30)
            : 30;

    const visitRecordScore = Math.max(
        0,
        Math.min(30, visitRecordBaseScore - visitRecordPastIncompleteCount * 5)
    );

    const meetingScore =
        summary.meeting_previous_month_attended === true ||
            summary.meeting_past_attended === true
            ? 10
            : 0;

    const jissekiPastIncompleteCount = Number(
        summary.jisseki_past_incomplete_count ?? 0
    );

    const jissekiScore = 20 - (jissekiPastIncompleteCount * 5);

    const trainingGoalScore = Number(summary.training_goal_selected_count ?? 0) * 5;

    const totalScore = Number(summary.total_score ?? 0);
    //const rankNo = Number(summary.rank_no ?? 0);
    //const medalRank = summary.medal_rank ?? "ブロンズ";

    return NextResponse.json({
        month: ym,
        monthOptions,
        userId,
        userName:
            summary.staff_name ??
            `${me.last_name_kanji ?? ""}${me.first_name_kanji ?? ""}`,
        totalScore,
        totalMaxScore: 150,
        badge: getBadge(totalScore),
        metrics: [
            {
                key: "service_hours",
                label: "サービス時間",
                score: serviceHoursScore,
                maxScore: 10,
                note: `${summary.service_hours ?? 0}時間`,
                linkUrl: addParams("/portal/shift-view", {
                    user_id: userId,
                    date: `${ym}-01`,
                }),
            },
            {
                key: "visit_record",
                label: "訪問記録",
                score: visitRecordScore,
                maxScore: 30,
                note: `当日完了 ${summary.houmon_same_day_done_count ?? 0}件 / 遅れ完了 ${summary.houmon_late_done_count ?? 0}件 / 当月未完了 ${summary.visit_record_current_month_incomplete_count ?? 0}件 / 過去未完了 ${summary.visit_record_past_incomplete_count ?? 0}件`,
                linkUrl: addParams("/portal/shift-view", {
                    user_id: userId,
                    date: `${ym}-01`,
                }),
            },
            {
                key: "meeting",
                label: "会議参加",
                score: meetingScore,
                maxScore: 10,
                note: `前月参加: ${summary.meeting_previous_month_attended ? "あり" : "なし"} / 過去参加: ${summary.meeting_past_attended ? "あり" : "なし"}`,
                linkUrl: addParams("/portal/monthly-meeting-check", {
                    ym: previousYm,
                    user_id: userId,
                }),
            },
            {
                key: "jisseki",
                label: "実績記録",
                score: jissekiScore,
                maxScore: 20,
                note: `前月完了 ${summary.jisseki_previous_month_done_count ?? 0}件 / 過去未完了 ${summary.jisseki_past_incomplete_count ?? 0}件`,
                linkUrl: addParams("/portal/disability-check", {
                    ym: previousYm,
                    user_id: userId,
                }),
            },
            {
                key: "training_goal",
                label: "目標・研修",
                score: trainingGoalScore,
                maxScore: 20,
                note: `${summary.training_goal_selected_count ?? 0}件`,
                linkUrl: addParams("/portal/training-goals", {
                    user_id: userId,
                }),
            },
        ],
        ranking: {
            rank: rankingRows.find((row) => row.user_id === userId)?.rank_no ?? null,
            totalMembers: rankingRows.length,
        },
        topRanking: (rankingRows ?? []).slice(0, 100).map((row) => ({
            rank: row.rank_no ?? 0,
            userId: row.user_id,
            score: row.score,
            name: row.staff_name ?? row.user_id,
            badge: getBadge(row.score),
        })),
        scoreHistory: (historyRows ?? []).map((row) => {
            const month = String(row.target_month).slice(0, 7);
            return {
                month,
                label: `${Number(month.slice(5, 7))}月`,
                score: calcDisplayTotalScore(row),
                rank: row.rank_no,
            };
        }),
        members: members.map((member) => ({
            userId: member.user_id,
            name: `${member.last_name_kanji ?? ""}${member.first_name_kanji ?? ""}`,
        })),
    });
}