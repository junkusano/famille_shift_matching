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
};

type DisabilityCheckRow = {
    is_checked: boolean | null;
    application_check: boolean | null;
    asigned_jisseki_staff_id: string | null;
};

type GoalRow = {
    id: string;
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

    const targetMonth = req.nextUrl.searchParams.get("month");
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
        checked_extra
      `
        )
        .eq("user_id", userId)
        .eq("target_month", `${ym}-01`)
        .maybeSingle<MeetingAttendanceRow>();

    const meetingRequired =
        meeting?.required !== false;

    const meetingDone =
        !meetingRequired ||
        meeting?.attended_regular === true ||
        meeting?.attended_extra === true ||
        meeting?.checked_regular === true ||
        meeting?.checked_extra === true;

    const meetingScore = meetingDone ? 100 : 0;

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
                .select("id")
                .eq("entry_id", entryId)
                .eq("row_type", "goal")
                .eq("selected", true)
                .returns<GoalRow[]>()
            : { data: [] as GoalRow[] };

    const selectedGoalCount =
        goals?.length ?? 0;

    const goalScore =
        selectedGoalCount === 0
            ? 0
            : Math.min(
                100,
                80 + (selectedGoalCount - 1) * 10
            );

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
            note: meetingRequired
                ? meetingDone
                    ? "参加済み"
                    : "未参加"
                : "対象外",
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
            score: Math.round((goalScore / 100) * SCORE_WEIGHTS.trainingGoal),
            maxScore: SCORE_WEIGHTS.trainingGoal,
            note:
                selectedGoalCount > 1
                    ? `${selectedGoalCount}件選択中（複数加点）`
                    : selectedGoalCount === 1
                        ? "1件選択中"
                        : "未設定",
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
                .eq("target_month", `${ym}-01`)
                .maybeSingle<MeetingAttendanceRow>();

            const memberMeetingRequired = memberMeeting?.required !== false;

            const memberMeetingDone =
                !memberMeetingRequired ||
                memberMeeting?.attended_regular === true ||
                memberMeeting?.attended_extra === true ||
                memberMeeting?.checked_regular === true ||
                memberMeeting?.checked_extra === true;

            const memberMeetingScore = memberMeetingDone ? 100 : 0;

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
                        .select("id")
                        .eq("entry_id", memberEntryId)
                        .eq("row_type", "goal")
                        .eq("selected", true)
                        .returns<GoalRow[]>()
                    : { data: [] as GoalRow[] };

            const memberGoalCount = memberGoals?.length ?? 0;

            const memberGoalScore =
                memberGoalCount === 0
                    ? 0
                    : Math.min(100, 80 + (memberGoalCount - 1) * 10);

            const memberTotalScore =
                Math.round((memberServiceScore / 100) * SCORE_WEIGHTS.serviceHours) +
                Math.round((memberVisitScore / 100) * SCORE_WEIGHTS.visitRecord) +
                Math.round((memberMeetingScore / 100) * SCORE_WEIGHTS.meeting) +
                Math.round((memberJissekiScore / 100) * SCORE_WEIGHTS.jisseki) +
                Math.round((memberGoalScore / 100) * SCORE_WEIGHTS.trainingGoal);

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
        members: members.map((member) => ({
            userId: member.user_id,
            name: `${member.last_name_kanji ?? ""}${member.first_name_kanji ?? ""}`,
        })),
    });
}