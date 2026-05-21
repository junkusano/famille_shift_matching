import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type ShiftRow = {
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
};

type DisabilityCheckRow = {
    is_checked: boolean | null;
    application_check: boolean | null;
    asigned_jisseki_staff_id: string | null;
};

type GoalRow = {
    id: string;
    selected: boolean | null;
    watched: boolean | null;
};

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

type Metric = {
    key: string;
    label: string;
    score: number;
    maxScore: number;
    note: string;
};

function isValidYearMonth(value: string | null) {
    return value !== null && /^\d{4}-\d{2}$/.test(value);
}

function getMonthRange(monthParam: string | null) {
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
}

function getPreviousYm(ym: string) {
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

    if (meeting?.attended_regular === true || meeting?.checked_regular === true) {
        return {
            meetingRequired,
            meetingScore: 100,
            note: "前月の月例参加あり",
        };
    }

    if (meeting?.attended_extra === true || meeting?.checked_extra === true) {
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
}

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

function buildRecentMonthsByYm(baseYm: string, count: number) {
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
}

function getBadge(score: number) {
    if (score >= 70) return "ゴールド";
    if (score >= 50) return "シルバー";
    if (score >= 30) return "ブロンズ";
    return "通常";
}

const SCORE_WEIGHTS = {
    serviceHours: 30,
    visitRecord: 30,
    meeting: 10,
    jisseki: 20,
    trainingGoal: 10,
};

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

    const targetMonth =
        req.nextUrl.searchParams.get("ym") ??
        req.nextUrl.searchParams.get("month");

    const { ym, startDate, endDate } = getMonthRange(targetMonth);

    const targetUserId = req.nextUrl.searchParams.get("user_id");
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
    const entryId = me.entry_id;

    const { data: shifts } = await supabaseAdmin
        .from("shift")
        .select(
            `
        shift_id,
        shift_start_date,
        shift_start_time,
        shift_end_time,
        staff_01_user_id,
        staff_02_user_id,
        staff_03_user_id
      `
        )
        .gte("shift_start_date", startDate)
        .lt("shift_start_date", endDate)
        .or(
            `staff_01_user_id.eq.${userId},staff_02_user_id.eq.${userId},staff_03_user_id.eq.${userId}`
        )
        .returns<ShiftRow[]>();

    const shiftRows = shifts ?? [];

    const shiftIds = shiftRows.map((s) => s.shift_id);

    const serviceTargetHours = 80;

    async function calculateMemberTotalScore(args: {
        memberUserId: string;
        memberEntryId: string | null;
        targetYm: string;
        targetStartDate: string;
        targetEndDate: string;
    }) {
        const { memberUserId, memberEntryId, targetYm, targetStartDate, targetEndDate } = args;

        const { data: memberShifts } = await supabaseAdmin
            .from("shift")
            .select(
                `
                shift_id,
                shift_start_date,
                shift_start_time,
                shift_end_time,
                staff_01_user_id,
                staff_02_user_id,
                staff_03_user_id
                `
            )
            .gte("shift_start_date", targetStartDate)
            .lt("shift_start_date", targetEndDate)
            .or(
                `staff_01_user_id.eq.${memberUserId},staff_02_user_id.eq.${memberUserId},staff_03_user_id.eq.${memberUserId}`
            )
            .returns<ShiftRow[]>();

        const memberShiftRows = memberShifts ?? [];
        const memberShiftIds = memberShiftRows.map((s) => s.shift_id);

        const memberTotalMinutes = memberShiftRows.reduce((sum, shift) => {
            return sum + calcMinutes(
                shift.shift_start_date,
                shift.shift_start_time,
                shift.shift_end_time
            );
        }, 0);

        const memberServiceHours = Math.round((memberTotalMinutes / 60) * 10) / 10;

        const memberServiceScore = Math.min(
            100,
            Math.round((memberServiceHours / serviceTargetHours) * 100)
        );

        const { data: memberRecords } =
            memberShiftIds.length > 0
                ? await supabaseAdmin
                    .from("shift_records")
                    .select("shift_id, status, created_at, updated_at")
                    .in("shift_id", memberShiftIds)
                    .returns<ShiftRecordRow[]>()
                : { data: [] as ShiftRecordRow[] };

        let memberSameDayDone = 0;
        let memberLateOrMissing = 0;

        for (const shift of memberShiftRows) {
            const record = (memberRecords ?? []).find(
                (r) =>
                    r.shift_id === shift.shift_id &&
                    completedStatuses.includes(r.status ?? "")
            );

            if (!record) {
                memberLateOrMissing++;
                continue;
            }

            const doneDate = String(record.updated_at ?? record.created_at ?? "").slice(0, 10);

            if (doneDate === shift.shift_start_date) {
                memberSameDayDone++;
            } else {
                memberLateOrMissing++;
            }
        }

        const memberVisitRate =
            memberShiftIds.length > 0
                ? Math.round((memberSameDayDone / memberShiftIds.length) * 100)
                : 0;

        const memberVisitScore = memberLateOrMissing > 0 ? 0 : memberVisitRate;

        const { data: memberMeeting } = await supabaseAdmin
            .from("monthly_meeting_attendance")
            .select("required, attended_regular, attended_extra, checked_regular, checked_extra, updated_at")
            .eq("user_id", memberUserId)
            .eq("target_month", `${getPreviousYm(targetYm)}-01`)
            .maybeSingle<MeetingAttendanceRow>();

        const { meetingScore: memberMeetingScore } = calcMeetingScore(memberMeeting, targetYm);

        const { data: memberJissekiRows } = await supabaseAdmin
            .from("disability_check_view")
            .select("is_checked, application_check, asigned_jisseki_staff_id")
            .eq("year_month", targetYm)
            .eq("asigned_jisseki_staff_id", memberUserId)
            .returns<DisabilityCheckRow[]>();

        const memberJissekiTotal = memberJissekiRows?.length ?? 0;

        const memberJissekiDone =
            memberJissekiRows?.filter(
                (r) => r.is_checked === true || r.application_check === true
            ).length ?? 0;

        const memberJissekiScore =
            memberJissekiTotal > 0
                ? Math.round((memberJissekiDone / memberJissekiTotal) * 100)
                : 0;

        const { data: memberGoals } =
            memberEntryId
                ? await supabaseAdmin
                    .from("employee_training_goals")
                    .select("id, selected, watched")
                    .eq("entry_id", memberEntryId)
                    .eq("row_type", "goal")
                    .eq("selected", true)
                    .eq("watched", true)
                    .returns<GoalRow[]>()
                : { data: [] as GoalRow[] };

        const memberWatchedGoalCount = memberGoals?.length ?? 0;

        const memberGoalScore = memberWatchedGoalCount * 5;
        return (
            Math.round((memberServiceScore / 100) * SCORE_WEIGHTS.serviceHours) +
            Math.round((memberVisitScore / 100) * SCORE_WEIGHTS.visitRecord) +
            Math.round((memberMeetingScore / 100) * SCORE_WEIGHTS.meeting) +
            Math.round((memberJissekiScore / 100) * SCORE_WEIGHTS.jisseki) +
            memberGoalScore
        );
    }

    const { data: records } =
        shiftIds.length > 0
            ? await supabaseAdmin
                .from("shift_records")
                .select(
                    `
              shift_id,
              status,
              created_at,
              updated_at
            `
                )
                .in("shift_id", shiftIds)
                .returns<ShiftRecordRow[]>()
            : { data: [] as ShiftRecordRow[] };

    const completedStatuses = [
        "submitted",
        "approved",
        "done",
        "completed",
    ];

    let sameDayDone = 0;
    let lateOrMissing = 0;

    for (const shift of shiftRows) {
        const record = (records ?? []).find(
            (r) =>
                r.shift_id === shift.shift_id &&
                completedStatuses.includes(r.status ?? "")
        );

        if (!record) {
            lateOrMissing++;
            continue;
        }

        const doneDate = String(
            record.updated_at ?? record.created_at ?? ""
        ).slice(0, 10);

        if (doneDate === shift.shift_start_date) {
            sameDayDone++;
        } else {
            lateOrMissing++;
        }
    }

    const visitRate =
        shiftIds.length > 0
            ? Math.round((sameDayDone / shiftIds.length) * 100)
            : 0;

    const visitScore =
        lateOrMissing > 0 ? 0 : visitRate;

    const { data: meeting } = await supabaseAdmin
        .from("monthly_meeting_attendance")
        .select(
            `
required,
attended_regular,
attended_extra,
checked_regular,
checked_extra,
updated_at
`
        )
        .eq("target_month", `${getPreviousYm(ym)}-01`)
        .maybeSingle<MeetingAttendanceRow>();

    const {
        meetingScore,
        note: meetingNote,
    } = calcMeetingScore(meeting, ym);

    const { data: jissekiRows } = await supabaseAdmin
        .from("disability_check_view")
        .select(
            `
        is_checked,
        application_check,
        asigned_jisseki_staff_id
      `
        )
        .eq("year_month", ym)
        .eq("asigned_jisseki_staff_id", userId)
        .returns<DisabilityCheckRow[]>();

    const jissekiTotal =
        jissekiRows?.length ?? 0;

    const jissekiDone =
        jissekiRows?.filter(
            (r) =>
                r.is_checked === true ||
                r.application_check === true
        ).length ?? 0;

    const jissekiScore =
        jissekiTotal > 0
            ? Math.round(
                (jissekiDone / jissekiTotal) * 100
            )
            : 0;

    const { data: goals } =
        entryId
            ? await supabaseAdmin
                .from("employee_training_goals")
                .select("id, selected, watched")
                .eq("entry_id", entryId)
                .eq("row_type", "goal")
                .eq("selected", true)
                .eq("watched", true)
                .returns<GoalRow[]>()
            : { data: [] as GoalRow[] };

    const watchedGoalCount = goals?.length ?? 0;

    const goalScore = watchedGoalCount * 5;
    const totalMinutes = shiftRows.reduce((sum, shift) => {
        return (
            sum +
            calcMinutes(
                shift.shift_start_date,
                shift.shift_start_time,
                shift.shift_end_time
            )
        );
    }, 0);

    const serviceHours = Math.round((totalMinutes / 60) * 10) / 10;

    const serviceRate = Math.min(
        100,
        Math.round((serviceHours / serviceTargetHours) * 100)
    );

    const metrics: Metric[] = [
        {
            key: "service_hours",
            label: "サービス時間",
            score: Math.round((serviceRate / 100) * SCORE_WEIGHTS.serviceHours),
            maxScore: SCORE_WEIGHTS.serviceHours,
            note: `${serviceHours}時間 / 目標${serviceTargetHours}時間`,
        },
        {
            key: "visit_record",
            label: "訪問記録当日完了率",
            score: Math.round((visitScore / 100) * SCORE_WEIGHTS.visitRecord),
            maxScore: SCORE_WEIGHTS.visitRecord,
            note:
                lateOrMissing > 0
                    ? `未完了・翌日以降が${lateOrMissing}件あるため0点`
                    : `${sameDayDone}/${shiftIds.length}件`,
        },
        {
            key: "meeting",
            label: "会議参加率",
            score: Math.round((meetingScore / 100) * SCORE_WEIGHTS.meeting),
            maxScore: SCORE_WEIGHTS.meeting,
            note: meetingNote,
        },
        {
            key: "jisseki",
            label: "実績記録",
            score: Math.round((jissekiScore / 100) * SCORE_WEIGHTS.jisseki),
            maxScore: SCORE_WEIGHTS.jisseki,
            note: `${jissekiDone}/${jissekiTotal}件`,
        },
        {
            key: "training_goal",
            label: "目標設定",
            score: goalScore,
            maxScore: Math.max(SCORE_WEIGHTS.trainingGoal, goalScore),
            note:
                watchedGoalCount > 1
                    ? `${watchedGoalCount}件受講完了（追加加点あり）`
                    : watchedGoalCount === 1
                        ? "1件受講完了"
                        : "受講完了なし",
        },
    ];

    const totalScore = metrics.reduce((sum, metric) => {
        return sum + metric.score;
    }, 0);

    const totalMaxScore = 100;

    const rankingScores = await Promise.all(
        members.map(async (member) => {
            const memberUserId = member.user_id;
            const memberEntryId = member.entry_id;

            const { data: memberShifts } = await supabaseAdmin
                .from("shift")
                .select(
                    `
                shift_id,
                shift_start_date,
                shift_start_time,
                shift_end_time,
                staff_01_user_id,
                staff_02_user_id,
                staff_03_user_id
                `
                )
                .gte("shift_start_date", startDate)
                .lt("shift_start_date", endDate)
                .or(
                    `staff_01_user_id.eq.${memberUserId},staff_02_user_id.eq.${memberUserId},staff_03_user_id.eq.${memberUserId}`
                )
                .returns<ShiftRow[]>();

            const memberShiftRows = memberShifts ?? [];
            const memberShiftIds = memberShiftRows.map((s) => s.shift_id);

            const memberTotalMinutes = memberShiftRows.reduce((sum, shift) => {
                return (
                    sum +
                    calcMinutes(
                        shift.shift_start_date,
                        shift.shift_start_time,
                        shift.shift_end_time
                    )
                );
            }, 0);

            const memberServiceHours = Math.round((memberTotalMinutes / 60) * 10) / 10;

            const memberServiceScore = Math.min(
                100,
                Math.round((memberServiceHours / serviceTargetHours) * 100)
            );

            const { data: memberRecords } =
                memberShiftIds.length > 0
                    ? await supabaseAdmin
                        .from("shift_records")
                        .select(
                            `
                        shift_id,
                        status,
                        created_at,
                        updated_at
                        `
                        )
                        .in("shift_id", memberShiftIds)
                        .returns<ShiftRecordRow[]>()
                    : { data: [] as ShiftRecordRow[] };

            let memberSameDayDone = 0;
            let memberLateOrMissing = 0;

            for (const shift of memberShiftRows) {
                const record = (memberRecords ?? []).find(
                    (r) =>
                        r.shift_id === shift.shift_id &&
                        completedStatuses.includes(r.status ?? "")
                );

                if (!record) {
                    memberLateOrMissing++;
                    continue;
                }

                const doneDate = String(
                    record.updated_at ?? record.created_at ?? ""
                ).slice(0, 10);

                if (doneDate === shift.shift_start_date) {
                    memberSameDayDone++;
                } else {
                    memberLateOrMissing++;
                }
            }

            const memberVisitRate =
                memberShiftIds.length > 0
                    ? Math.round((memberSameDayDone / memberShiftIds.length) * 100)
                    : 0;

            const memberVisitScore =
                memberLateOrMissing > 0 ? 0 : memberVisitRate;

            const { data: memberMeeting } = await supabaseAdmin
                .from("monthly_meeting_attendance")
                .select(
                    `
                required,
                attended_regular,
                attended_extra,
                checked_regular,
                checked_extra
                `
                )
                .eq("user_id", memberUserId)
                .eq("target_month", `${getPreviousYm(ym)}-01`)
                .maybeSingle<MeetingAttendanceRow>();

            const { meetingScore: memberMeetingScore } = calcMeetingScore(memberMeeting, ym);

            const { data: memberJissekiRows } = await supabaseAdmin
                .from("disability_check_view")
                .select(
                    `
                is_checked,
                application_check,
                asigned_jisseki_staff_id
                `
                )
                .eq("year_month", ym)
                .eq("asigned_jisseki_staff_id", memberUserId)
                .returns<DisabilityCheckRow[]>();

            const memberJissekiTotal = memberJissekiRows?.length ?? 0;

            const memberJissekiDone =
                memberJissekiRows?.filter(
                    (r) =>
                        r.is_checked === true ||
                        r.application_check === true
                ).length ?? 0;

            const memberJissekiScore =
                memberJissekiTotal > 0
                    ? Math.round((memberJissekiDone / memberJissekiTotal) * 100)
                    : 0;

            const { data: memberGoals } =
                memberEntryId
                    ? await supabaseAdmin
                        .from("employee_training_goals")
                        .select("id, selected, watched")
                        .eq("entry_id", memberEntryId)
                        .eq("row_type", "goal")
                        .eq("selected", true)
                        .eq("watched", true)
                        .returns<GoalRow[]>()
                    : { data: [] as GoalRow[] };

            const memberWatchedGoalCount = memberGoals?.length ?? 0;

            const memberGoalScore = memberWatchedGoalCount * 5;
            const memberTotalScore =
                Math.round((memberServiceScore / 100) * SCORE_WEIGHTS.serviceHours) +
                Math.round((memberVisitScore / 100) * SCORE_WEIGHTS.visitRecord) +
                Math.round((memberMeetingScore / 100) * SCORE_WEIGHTS.meeting) +
                Math.round((memberJissekiScore / 100) * SCORE_WEIGHTS.jisseki) +
                memberGoalScore;

            return {
                userId: memberUserId,
                totalScore: memberTotalScore,
            };
        })
    );

    const sortedRankingScores = rankingScores
        .filter((row) => Number.isFinite(row.totalScore))
        .sort((a, b) => b.totalScore - a.totalScore);

    const currentRank =
        sortedRankingScores.findIndex((row) => row.userId === userId) + 1;

    const ranking = {
        rank: currentRank > 0 ? currentRank : null,
        totalMembers: sortedRankingScores.length,
    };

    const topRanking = sortedRankingScores
        .slice(0, 10)
        .map((row, index) => {
            const member = members.find(
                (m) => m.user_id === row.userId
            );

            return {
                rank: index + 1,
                userId: row.userId,
                score: row.totalScore,
                name: member
                    ? `${member.last_name_kanji ?? ""}${member.first_name_kanji ?? ""}`
                    : row.userId,
            };
        });

    const historyMonths = buildRecentMonthsByYm(ym, 6);

    const scoreHistory = await Promise.all(
        historyMonths.map(async (month) => {
            const range = getMonthRange(month.value);

            const monthlyScores = await Promise.all(
                members.map(async (member) => {
                    const monthlyTotalScore = await calculateMemberTotalScore({
                        memberUserId: member.user_id,
                        memberEntryId: member.entry_id,
                        targetYm: range.ym,
                        targetStartDate: range.startDate,
                        targetEndDate: range.endDate,
                    });

                    return {
                        userId: member.user_id,
                        totalScore: monthlyTotalScore,
                    };
                })
            );

            const sortedMonthlyScores = monthlyScores
                .filter((row) => Number.isFinite(row.totalScore))
                .sort((a, b) => b.totalScore - a.totalScore);

            const rankIndex = sortedMonthlyScores.findIndex(
                (row) => row.userId === userId
            );

            const myScore = sortedMonthlyScores.find(
                (row) => row.userId === userId
            );

            return {
                month: month.value,
                label: month.label,
                score: myScore?.totalScore ?? 0,
                rank: rankIndex >= 0 ? rankIndex + 1 : null,
            };
        })
    );

    return NextResponse.json({
        month: ym,
        monthOptions,
        userId,
        userName: `${me.last_name_kanji ?? ""}${me.first_name_kanji ?? ""}`,
        totalScore,
        totalMaxScore,
        badge: getBadge(totalScore),
        metrics,
        ranking,
        topRanking,
        scoreHistory,
        members: members.map((member) => ({
            userId: member.user_id,
            name: `${member.last_name_kanji ?? ""}${member.first_name_kanji ?? ""}`,
        })),
    });
}