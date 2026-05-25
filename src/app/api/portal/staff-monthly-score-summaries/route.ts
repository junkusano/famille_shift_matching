import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";

type ShiftRow = {
    shift_id: number;
    shift_start_date: string;
    shift_start_time: string | null;
    shift_end_time: string | null;
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
    updated_at: string | null;
};

type DisabilityCheckRow = {
    is_checked: boolean | null;
    application_check: boolean | null;
};

type MemberRow = {
    user_id: string;
    entry_id: string | null;
    status: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    last_name_kana: string | null;
    first_name_kana: string | null;
};

const COMPLETED_RECORD_STATUSES = ["submitted", "approved", "done", "completed"];
const MEETING_START_MONTH = "2026-03-01";

const SCORE_WEIGHTS = {
    serviceHours: 80,
    visitRecord: 30,
    meeting: 10,
    jisseki: 30,
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
        targetMonthDate: `${ym}-01`,
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

function calcMinutes(date: string, start?: string | null, end?: string | null) {
    if (!start || !end) return 0;
    const s = new Date(`${date}T${start}`);
    const e = new Date(`${date}T${end}`);
    const diff = e.getTime() - s.getTime();
    return diff > 0 ? Math.round(diff / 60000) : 0;
}

function isCompletedRecord(record?: ShiftRecordRow | null) {
    return Boolean(record && COMPLETED_RECORD_STATUSES.includes(record.status ?? ""));
}

function isMeetingAttended(row?: MeetingAttendanceRow | null) {
    if (!row) return false;
    if (row.required === false) return true;
    return row.attended_regular === true || row.attended_extra === true;
}

function calcMeetingScore(row?: MeetingAttendanceRow | null, displayYm?: string) {
    if (!row) return 0;
    if (row.required === false) return 100;
    if (row.attended_regular === true) return 100;

    if (row.attended_extra === true && displayYm) {
        const [yearText, monthText] = displayYm.split("-");
        const deadline = `${yearText}-${monthText}-10`;
        const checkedDate = String(row.updated_at ?? "").slice(0, 10);
        return checkedDate && checkedDate <= deadline ? 100 : 50;
    }

    return 0;
}

function getMedalRank(score: number) {
    if (score >= 100) return "プラチナ";
    if (score >= 80) return "ゴールド";
    if (score >= 60) return "シルバー";
    return "ブロンズ";
}

async function getAssignedShifts(userId: string, startDate: string, endDate?: string) {
    let query = supabaseAdmin
        .from("shift")
        .select("shift_id, shift_start_date, shift_start_time, shift_end_time")
        .gte("shift_start_date", startDate)
        .or(`staff_01_user_id.eq.${userId},staff_02_user_id.eq.${userId},staff_03_user_id.eq.${userId}`);

    if (endDate) {
        query = query.lt("shift_start_date", endDate);
    }

    const { data, error } = await query.returns<ShiftRow[]>();
    if (error) throw error;
    return data ?? [];
}

async function getRecordsByShiftIds(shiftIds: number[]) {
    if (shiftIds.length === 0) return [] as ShiftRecordRow[];

    const { data, error } = await supabaseAdmin
        .from("shift_records")
        .select("shift_id, status, created_at, updated_at")
        .in("shift_id", shiftIds)
        .returns<ShiftRecordRow[]>();

    if (error) throw error;
    return data ?? [];
}

async function calculateSummaryForMember(args: {
    member: MemberRow;
    ym: string;
    targetMonthDate: string;
    startDate: string;
    endDate: string;
}) {
    const { member, ym, targetMonthDate, startDate, endDate } = args;
    const userId = member.user_id;
    const previousYm = getPreviousYm(ym);
    const previousMonthDate = `${previousYm}-01`;

    const currentShifts = await getAssignedShifts(userId, startDate, endDate);
    const currentShiftIds = currentShifts.map((s) => s.shift_id);
    const currentRecords = await getRecordsByShiftIds(currentShiftIds);

    const totalMinutes = currentShifts.reduce((sum, shift) => {
        return sum + calcMinutes(shift.shift_start_date, shift.shift_start_time, shift.shift_end_time);
    }, 0);

    const serviceHours = Math.round((totalMinutes / 60) * 10) / 10;

    let visitRecordSameDayDoneCount = 0;
    let visitRecordLateDoneCount = 0;
    let visitRecordCurrentMonthIncompleteCount = 0;

    for (const shift of currentShifts) {
        const record = currentRecords.find((r) => r.shift_id === shift.shift_id && isCompletedRecord(r));

        if (!record) {
            visitRecordCurrentMonthIncompleteCount += 1;
            continue;
        }

        const doneDate = String(record.updated_at ?? record.created_at ?? "").slice(0, 10);

        if (doneDate === shift.shift_start_date) {
            visitRecordSameDayDoneCount += 1;
        } else {
            visitRecordLateDoneCount += 1;
        }
    }

    const pastShifts = await getAssignedShifts(userId, "1900-01-01", startDate);
    const pastRecords = await getRecordsByShiftIds(pastShifts.map((s) => s.shift_id));

    const visitRecordPastIncompleteCount = pastShifts.filter((shift) => {
        const record = pastRecords.find((r) => r.shift_id === shift.shift_id && isCompletedRecord(r));
        return !record;
    }).length;

    const { data: previousMeeting, error: previousMeetingError } = await supabaseAdmin
        .from("monthly_meeting_attendance")
        .select("required, attended_regular, attended_extra, updated_at")
        .eq("user_id", userId)
        .eq("target_month", previousMonthDate)
        .maybeSingle<MeetingAttendanceRow>();

    if (previousMeetingError) throw previousMeetingError;

    const { data: pastMeetings, error: pastMeetingError } = await supabaseAdmin
        .from("monthly_meeting_attendance")
        .select("required, attended_regular, attended_extra, updated_at")
        .eq("user_id", userId)
        .gte("target_month", MEETING_START_MONTH)
        .lt("target_month", previousMonthDate)
        .returns<MeetingAttendanceRow[]>();

    if (pastMeetingError) throw pastMeetingError;

    const meetingPreviousMonthAttended = isMeetingAttended(previousMeeting);
    const meetingPastAttended = (pastMeetings ?? []).some((row) => isMeetingAttended(row));
    const meetingScore = calcMeetingScore(previousMeeting, ym);

    const { data: previousJissekiRows, error: previousJissekiError } = await supabaseAdmin
        .from("disability_check_view")
        .select("is_checked, application_check")
        .eq("year_month", previousYm)
        .eq("asigned_jisseki_staff_id", userId)
        .returns<DisabilityCheckRow[]>();

    if (previousJissekiError) throw previousJissekiError;

    const jissekiPreviousMonthDoneCount =
        previousJissekiRows?.filter((r) => r.is_checked === true || r.application_check === true).length ?? 0;

    const { data: pastJissekiRows, error: pastJissekiError } = await supabaseAdmin
        .from("disability_check_view")
        .select("is_checked, application_check")
        .lt("year_month", previousYm)
        .eq("asigned_jisseki_staff_id", userId)
        .returns<DisabilityCheckRow[]>();

    if (pastJissekiError) throw pastJissekiError;

    const jissekiPastIncompleteCount =
        pastJissekiRows?.filter((r) => !(r.is_checked === true || r.application_check === true)).length ?? 0;

    const { data: goals, error: goalsError } = member.entry_id
        ? await supabaseAdmin
            .from("employee_training_goals")
            .select("id")
            .eq("entry_id", member.entry_id)
            .eq("row_type", "goal")
            .eq("selected", true)
        : { data: [], error: null };

    if (goalsError) throw goalsError;

    const trainingGoalSelectedCount = goals?.length ?? 0;

    const serviceScore = Math.min(SCORE_WEIGHTS.serviceHours, Math.floor(serviceHours / 20) * 10);

    const visitRecordTotalCount = currentShifts.length;
    const visitRate =
        visitRecordTotalCount > 0
            ? Math.round((visitRecordSameDayDoneCount / visitRecordTotalCount) * 100)
            : 0;

    const visitScore =
        visitRecordLateDoneCount > 0 || visitRecordCurrentMonthIncompleteCount > 0
            ? 0
            : Math.round((visitRate / 100) * SCORE_WEIGHTS.visitRecord);

    const jissekiTotal = previousJissekiRows?.length ?? 0;
    const jissekiRate =
        jissekiTotal > 0 ? Math.round((jissekiPreviousMonthDoneCount / jissekiTotal) * 100) : 0;
    const jissekiScore = Math.round((jissekiRate / 100) * SCORE_WEIGHTS.jisseki);

    const trainingGoalScore = trainingGoalSelectedCount * 5;
    const totalScore = serviceScore + visitScore + Math.round((meetingScore / 100) * SCORE_WEIGHTS.meeting) + jissekiScore + trainingGoalScore;

    return {
        target_month: targetMonthDate,
        user_id: userId,
        entry_id: member.entry_id,
        staff_name: `${member.last_name_kanji ?? ""}${member.first_name_kanji ?? ""}`,
        service_hours: serviceHours,
        visit_record_total_count: visitRecordTotalCount,
        visit_record_same_day_done_count: visitRecordSameDayDoneCount,
        visit_record_late_done_count: visitRecordLateDoneCount,
        visit_record_current_month_incomplete_count: visitRecordCurrentMonthIncompleteCount,
        visit_record_past_incomplete_count: visitRecordPastIncompleteCount,
        meeting_previous_month_attended: meetingPreviousMonthAttended,
        meeting_past_attended: meetingPastAttended,
        jisseki_previous_month_done_count: jissekiPreviousMonthDoneCount,
        jisseki_past_incomplete_count: jissekiPastIncompleteCount,
        training_goal_selected_count: trainingGoalSelectedCount,
        total_score: totalScore,
        rank_no: null as number | null,
        medal_rank: getMedalRank(totalScore),
        updated_at: new Date().toISOString(),
    };
}

export async function POST(req: NextRequest) {

    /*
    const token = req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    */

    const targetMonth = req.nextUrl.searchParams.get("ym") ?? req.nextUrl.searchParams.get("month");
    const { ym, targetMonthDate, startDate, endDate } = getMonthRange(targetMonth);

    const { data: members, error: membersError } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, entry_id, status, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana")
        .not("user_id", "is", null)
        .neq("status", "removed_from_lineworks_kaipoke")
        .order("last_name_kana", { ascending: true })
        .order("first_name_kana", { ascending: true })
        .returns<MemberRow[]>();

    if (membersError) {
        return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    try {
        const summaries = await Promise.all(
            (members ?? []).map((member) =>
                calculateSummaryForMember({ member, ym, targetMonthDate, startDate, endDate })
            )
        );

        const rankedSummaries = summaries
            .sort((a, b) => b.total_score - a.total_score)
            .map((row, index) => ({
                ...row,
                rank_no: index + 1,
                medal_rank: getMedalRank(row.total_score),
            }));

        const { error: upsertError } = await supabaseAdmin
            .from("staff_monthly_score_summaries")
            .upsert(rankedSummaries, { onConflict: "target_month,user_id" });

        if (upsertError) {
            return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            ym,
            target_month: targetMonthDate,
            inserted_or_updated: rankedSummaries.length,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "unknown error" },
            { status: 500 }
        );
    }
}
