//api/cron/staff-monthly-score-summaries/route.ts
//当月のみ更新変更箇所1
import { NextRequest, NextResponse } from "next/server";
//指定月のみ更新変更箇所1
//mport { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type SummaryRow = {
    id: string;
    target_month: string;
    user_id: string;
    entry_id: string | null;
    staff_name: string | null;
    service_hours: number | string | null;
    visit_record_total_count: number | null;
    houmon_same_day_done_count: number | null;
    houmon_late_done_count: number | null;
    visit_record_current_month_incomplete_count: number | null;
    visit_record_past_incomplete_count: number | null;
    meeting_previous_month_attended: boolean | null;
    meeting_past_attended: boolean | null;
    jisseki_previous_month_done_count: number | null;
    jisseki_past_incomplete_count: number | null;
    training_goal_selected_count: number | null;
};

type ShiftRecordViewRow = {
    shift_start_date: string | null;
    shift_start_time: string | null;
    shift_end_date: string | null;
    shift_end_time: string | null;
    kaipoke_cs_id: string | null;
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
    staff_02_attend_flg: boolean | null;
    staff_03_attend_flg: boolean | null;
    record_status: string | null;
    record_created_at: string | null;
};

type IncompleteCount = {
    currentMonth: number;
    past: number;
};

type DisabilityCheckRow = {
    year_month: string | null;
    application_check: boolean | null;
    asigned_jisseki_staff_id: string | null;
};

function getJstTodayDateString() {
    const now = new Date();
    const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

    return `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, "0")}-${String(
        jst.getDate()
    ).padStart(2, "0")}`;
}

function getNextMonthStartDate(targetMonth: string) {
    const [year, month] = targetMonth.slice(0, 7).split("-").map(Number);
    const nextMonth = new Date(year, month, 1);

    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
}

function getJissekiBaseYearMonth() {
    const now = new Date();
    const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

    const year = jst.getFullYear();
    const month = jst.getMonth() + 1;
    const day = jst.getDate();

    const targetDate =
        day <= 10
            ? new Date(year, month - 3, 1)
            : new Date(year, month - 2, 1);

    return `${targetDate.getFullYear()}-${String(
        targetDate.getMonth() + 1
    ).padStart(2, "0")}`;
}

function addIncompleteCount(
    map: Map<string, IncompleteCount>,
    userId: string,
    type: "currentMonth" | "past"
) {
    if (!userId) return;

    const current = map.get(userId) ?? {
        currentMonth: 0,
        past: 0,
    };

    current[type] += 1;
    map.set(userId, current);
}
//指定月のみ更新変更箇所2 以下をコメントアウト
function getTargetMonth(req: NextRequest) {
    const ym = req.nextUrl.searchParams.get("ym");

    if (ym && /^\d{4}-\d{2}$/.test(ym)) {
        return `${ym}-01`;
    }

    const now = new Date();
    const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

    const year = jst.getFullYear();
    const month = jst.getMonth() + 1;
    const day = jst.getDate();

    const targetDate =
        day === 1
            ? new Date(year, month - 2, 1)
            : new Date(year, month - 1, 1);

    const targetYm = `${targetDate.getFullYear()}-${String(
        targetDate.getMonth() + 1
    ).padStart(2, "0")}`;

    if (targetYm < "2026-05") {
        return "2026-05-01";
    }

    return `${targetYm}-01`;
}

async function fetchAllShiftRows(
    fromDate: string,
    toDate: string,
    selectShiftColumns: string
): Promise<ShiftRecordViewRow[]> {
    const pageSize = 1000;
    let from = 0;
    const allRows: ShiftRecordViewRow[] = [];

    while (true) {
        const { data, error } = await supabaseAdmin
            .from("shift_shift_record_view")
            .select(selectShiftColumns)
            .gte("shift_start_date", fromDate)
            .lt("shift_start_date", toDate)
            .order("shift_start_date", { ascending: true })
            .range(from, from + pageSize - 1)
            .returns<ShiftRecordViewRow[]>();

        if (error) {
            throw error;
        }

        const rows = data ?? [];
        allRows.push(...rows);

        if (rows.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    return allRows;
}

function calcShiftHours(shift: ShiftRecordViewRow) {
    if (!shift.shift_start_date || !shift.shift_start_time || !shift.shift_end_time) {
        return 0;
    }

    const start = new Date(`${shift.shift_start_date}T${shift.shift_start_time}`);
    const endDate = shift.shift_end_date || shift.shift_start_date;
    let end = new Date(`${endDate}T${shift.shift_end_time}`);

    if (end <= start) {
        end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }

    return Math.round(((end.getTime() - start.getTime()) / 1000 / 60 / 60) * 10) / 10;
}

function addServiceHours(
    map: Map<string, number>,
    userId: string | null,
    hours: number
) {
    if (!userId || hours <= 0) return;

    map.set(userId, Math.round(((map.get(userId) ?? 0) + hours) * 10) / 10);
}

function calcVisitRecordScore(row: SummaryRow) {
    const total = Number(row.visit_record_total_count ?? 0);
    const sameDay = Number(row.houmon_same_day_done_count ?? 0);
    const pastIncomplete = Number(row.visit_record_past_incomplete_count ?? 0);

    const sameDayScore = total <= 0 ? 0 : Math.round((sameDay / total) * 30);

    return Math.max(0, 30 + sameDayScore - pastIncomplete * 5);
}

function calcTotalScore(row: SummaryRow) {
    const serviceHoursScore = Math.min(
        80,
        Math.floor(Number(row.service_hours ?? 0) / 20) * 10
    );

    const visitRecordScore = calcVisitRecordScore(row);

    const meetingScore =
        row.meeting_previous_month_attended === true ||
            row.meeting_past_attended === true
            ? 10
            : 0;

    const jissekiScore = Number(row.jisseki_previous_month_done_count ?? 0) * 2;

    const trainingGoalScore = Number(row.training_goal_selected_count ?? 0) * 5;

    return (
        serviceHoursScore +
        visitRecordScore +
        meetingScore +
        jissekiScore +
        trainingGoalScore
    );
}

function getMedalRank(score: number) {
    if (score >= 100) return "プラチナ";
    if (score >= 80) return "ゴールド";
    if (score >= 60) return "シルバー";
    return "ブロンズ";
}

function getPreviousMonthStartDate(targetMonth: string) {
    const [year, month] = targetMonth.slice(0, 7).split("-").map(Number);
    const previousMonth = new Date(year, month - 2, 1);

    return `${previousMonth.getFullYear()}-${String(
        previousMonth.getMonth() + 1
    ).padStart(2, "0")}-01`;
}

//当月のみ更新変更箇所３
export async function GET(req: NextRequest) {
    //指定月のみ更新変更箇所3
    //export async function GET() {
    try {
        //指定月のみ更新変更箇所４
        //const targetMonth = "2026-05-01";
        //当月のみ更新変更箇所４
        const targetMonth = getTargetMonth(req);

        const { data: initialRows, error } = await supabaseAdmin
            .from("staff_monthly_score_summaries")
            .select("*")
            .eq("target_month", targetMonth)
            .returns<SummaryRow[]>();

        if (error) {
            throw error;
        }

        let rows = initialRows ?? [];

        if (!rows || rows.length === 0) {
            const [year, month] = targetMonth.slice(0, 7).split("-").map(Number);
            const previousMonthDate = new Date(year, month - 2, 1);
            const previousMonth = `${previousMonthDate.getFullYear()}-${String(
                previousMonthDate.getMonth() + 1
            ).padStart(2, "0")}-01`;

            const { data: previousRows, error: previousError } = await supabaseAdmin
                .from("staff_monthly_score_summaries")
                .select("*")
                .eq("target_month", previousMonth)
                .returns<SummaryRow[]>();

            if (previousError) {
                throw previousError;
            }

            const seedRows = (previousRows ?? []).map((row) => ({
                target_month: targetMonth,
                user_id: row.user_id,
                entry_id: row.entry_id,
                staff_name: row.staff_name,
                service_hours: 0,
                visit_record_total_count: 0,
                houmon_same_day_done_count: 0,
                houmon_late_done_count: 0,
                visit_record_current_month_incomplete_count: 0,
                visit_record_past_incomplete_count: 0,
                meeting_previous_month_attended: false,
                meeting_past_attended: false,
                jisseki_previous_month_done_count: 0,
                jisseki_past_incomplete_count: 0,
                training_goal_selected_count: 0,
                total_score: 0,
                rank_no: null,
                medal_rank: "ブロンズ",
                updated_at: new Date().toISOString(),
            }));

            if (seedRows.length > 0) {
                const { error: seedError } = await supabaseAdmin
                    .from("staff_monthly_score_summaries")
                    .upsert(seedRows, {
                        onConflict: "target_month,user_id",
                    });

                if (seedError) {
                    throw seedError;
                }

                const { data: createdRows, error: reloadError } = await supabaseAdmin
                    .from("staff_monthly_score_summaries")
                    .select("*")
                    .eq("target_month", targetMonth)
                    .returns<SummaryRow[]>();

                if (reloadError) {
                    throw reloadError;
                }

                rows = createdRows ?? [];
            }
        }

        if (error) {
            throw error;
        }

        const todayDate = getJstTodayDateString();
        const nextMonthStart = getNextMonthStartDate(targetMonth);

        const currentMonthEndDate =
            todayDate < nextMonthStart ? todayDate : nextMonthStart;

        const selectShiftColumns =
            "shift_start_date, shift_start_time, shift_end_date, shift_end_time, kaipoke_cs_id, staff_01_user_id, staff_02_user_id, staff_03_user_id, staff_02_attend_flg, staff_03_attend_flg, record_status, record_created_at";

        const currentMonthShiftRows = await fetchAllShiftRows(
            targetMonth,
            nextMonthStart,
            selectShiftColumns
        );

        const pastShiftRows = await fetchAllShiftRows(
            "2025-11-01",
            targetMonth,
            selectShiftColumns
        );

        const shiftRecordRows = [
            ...currentMonthShiftRows,
            ...pastShiftRows,
        ];

        const incompleteCountMap = new Map<string, IncompleteCount>();
        const visitTotalCountMap = new Map<string, number>();
        const houmonSameDayDoneCountMap = new Map<string, number>();
        const houmonLateDoneCountMap = new Map<string, number>();
        const visitCurrentMonthIncompleteCountMap = new Map<string, number>();

        const serviceHoursMap = new Map<string, number>();

        const jissekiPreviousMonthDoneMap = new Map<string, number>();
        const jissekiPastIncompleteMap = new Map<string, number>();

        const jissekiBaseYearMonth = getJissekiBaseYearMonth();

        const meetingPreviousMonthAttendedMap = new Map<string, boolean>();

        const previousMeetingMonth = getPreviousMonthStartDate(targetMonth);

        const { data: meetingRows, error: meetingError } = await supabaseAdmin
            .from("monthly_meeting_attendance")
            .select("user_id, attended_regular, attended_extra, checked_regular, checked_extra")
            .eq("target_month", previousMeetingMonth);

        if (meetingError) {
            throw meetingError;
        }

        for (const row of meetingRows ?? []) {
            const attended =
                row.attended_regular === true ||
                row.attended_extra === true ||
                row.checked_regular === true ||
                row.checked_extra === true;

            meetingPreviousMonthAttendedMap.set(row.user_id, attended);
        }

        const { data: disabilityRows, error: disabilityError } = await supabaseAdmin
            .from("disability_check_view")
            .select("year_month, application_check, asigned_jisseki_staff_id")
            .not("asigned_jisseki_staff_id", "is", null)
            .gte("year_month", "2025-11")
            .lte("year_month", jissekiBaseYearMonth)
            .range(0, 9999)
            .returns<DisabilityCheckRow[]>();

        if (disabilityError) {
            throw disabilityError;
        }


        for (const row of disabilityRows ?? []) {
            const staffId = row.asigned_jisseki_staff_id;
            if (!staffId || !row.year_month) continue;

            if (row.year_month === jissekiBaseYearMonth && row.application_check === true) {
                jissekiPreviousMonthDoneMap.set(
                    staffId,
                    (jissekiPreviousMonthDoneMap.get(staffId) ?? 0) + 1
                );
            }

            if (row.application_check === false) {
                jissekiPastIncompleteMap.set(
                    staffId,
                    (jissekiPastIncompleteMap.get(staffId) ?? 0) + 1
                );
            }
        }

        const excludedKaipokeIds = [
            "999999999",
            "9999999998",
            "9999999996",
            "9999999994",
            "9999999980",
        ];

        for (const shift of shiftRecordRows ?? []) {
            if (excludedKaipokeIds.includes(String(shift.kaipoke_cs_id))) {
                continue;
            }

            if (
                shift.shift_start_date &&
                shift.shift_start_date >= targetMonth &&
                shift.shift_start_date < nextMonthStart
            ) {
                const hours = calcShiftHours(shift);

                addServiceHours(serviceHoursMap, shift.staff_01_user_id, hours);

                if (shift.staff_02_attend_flg === true) {
                    addServiceHours(serviceHoursMap, shift.staff_02_user_id, hours);
                }

                if (shift.staff_03_attend_flg === true) {
                    addServiceHours(serviceHoursMap, shift.staff_03_user_id, hours);
                }
            }

            if (
                shift.shift_start_date &&
                shift.shift_start_date >= targetMonth &&
                shift.shift_start_date < nextMonthStart
            ) {
                const userIds = [
                    shift.staff_01_user_id,
                    shift.staff_02_user_id,
                    shift.staff_03_user_id,
                ].filter(Boolean) as string[];

                const isSubmitted = shift.record_status === "submitted";

                const recordCreatedDate = shift.record_created_at
                    ? new Date(shift.record_created_at)
                        .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" })
                        .slice(0, 10)
                    : null;

                const isSameDayDone =
                    isSubmitted &&
                    recordCreatedDate === shift.shift_start_date;

                const isLateDone =
                    isSubmitted &&
                    recordCreatedDate !== null &&
                    recordCreatedDate > shift.shift_start_date;

                for (const userId of userIds) {
                    visitTotalCountMap.set(
                        userId,
                        (visitTotalCountMap.get(userId) ?? 0) + 1
                    );

                    if (isSameDayDone) {
                        houmonSameDayDoneCountMap.set(
                            userId,
                            (houmonSameDayDoneCountMap.get(userId) ?? 0) + 1
                        );
                    } else if (isLateDone) {
                        houmonLateDoneCountMap.set(
                            userId,
                            (houmonLateDoneCountMap.get(userId) ?? 0) + 1
                        );
                    } else {
                        visitCurrentMonthIncompleteCountMap.set(
                            userId,
                            (visitCurrentMonthIncompleteCountMap.get(userId) ?? 0) + 1
                        );
                    }
                }
            }
            const type =
                shift.shift_start_date >= targetMonth &&
                    shift.shift_start_date < currentMonthEndDate
                    ? "currentMonth"
                    : shift.shift_start_date >= "2025-11-01" &&
                        shift.shift_start_date < targetMonth
                        ? "past"
                        : null;

            if (!type) continue;

            addIncompleteCount(incompleteCountMap, shift.staff_01_user_id ?? "", type);
            addIncompleteCount(incompleteCountMap, shift.staff_02_user_id ?? "", type);
            addIncompleteCount(incompleteCountMap, shift.staff_03_user_id ?? "", type);
        }

        const scoredRows = (rows ?? [])
            .map((row) => {
                const rowWithIncompleteCounts = {
                    ...row,
                    service_hours:
                        serviceHoursMap.get(row.user_id) ?? row.service_hours ?? 0,
                    visit_record_total_count:
                        visitTotalCountMap.get(row.user_id) ?? 0,
                    houmon_same_day_done_count:
                        houmonSameDayDoneCountMap.get(row.user_id) ?? 0,
                    houmon_late_done_count:
                        houmonLateDoneCountMap.get(row.user_id) ?? 0,
                    visit_record_current_month_incomplete_count:
                        visitCurrentMonthIncompleteCountMap.get(row.user_id) ?? 0,
                    visit_record_past_incomplete_count:
                        incompleteCountMap.get(row.user_id)?.past ?? 0,
                    jisseki_previous_month_done_count:
                        jissekiPreviousMonthDoneMap.get(row.user_id) ?? 0,
                    jisseki_past_incomplete_count:
                        jissekiPastIncompleteMap.get(row.user_id) ?? 0,
                };

                return {
                    ...rowWithIncompleteCounts,
                    total_score: calcTotalScore(rowWithIncompleteCounts),
                };
            })
            .sort((a, b) => b.total_score - a.total_score);

        const updates = scoredRows.map((row, index) => ({
            id: row.id,
            target_month: row.target_month,
            user_id: row.user_id,
            entry_id: row.entry_id,
            staff_name: row.staff_name,
            service_hours:
                serviceHoursMap.get(row.user_id) ?? row.service_hours ?? 0,
            visit_record_total_count:
                visitTotalCountMap.get(row.user_id) ?? 0,
            houmon_same_day_done_count: row.houmon_same_day_done_count ?? 0,
            houmon_late_done_count: row.houmon_late_done_count ?? 0,
            visit_record_current_month_incomplete_count:
                incompleteCountMap.get(row.user_id)?.currentMonth ?? 0,
            visit_record_past_incomplete_count:
                incompleteCountMap.get(row.user_id)?.past ?? 0,
            meeting_previous_month_attended:
                meetingPreviousMonthAttendedMap.get(row.user_id) ?? false,
            meeting_past_attended: row.meeting_past_attended ?? false,
            jisseki_previous_month_done_count:
                jissekiPreviousMonthDoneMap.get(row.user_id) ?? 0,
            jisseki_past_incomplete_count:
                jissekiPastIncompleteMap.get(row.user_id) ?? 0,
            training_goal_selected_count:
                row.training_goal_selected_count ?? 0,
            total_score: row.total_score,
            rank_no: index + 1,
            medal_rank: getMedalRank(row.total_score),
            updated_at: new Date().toISOString(),
        }));

        if (updates.length > 0) {
            const { error: upsertError } = await supabaseAdmin
                .from("staff_monthly_score_summaries")
                .upsert(updates, {
                    onConflict: "target_month,user_id",
                });

            if (upsertError) {
                throw upsertError;
            }
        }
        return NextResponse.json({
            ok: true,
            target_month: targetMonth,
            jisseki_base_year_month: jissekiBaseYearMonth,
            disability_check_count: disabilityRows?.length ?? 0,
            jisseki_previous_month_done_user_count: jissekiPreviousMonthDoneMap.size,
            jisseki_past_incomplete_user_count: jissekiPastIncompleteMap.size,
            updated_count: updates.length,
        });
    } catch (e: unknown) {
        console.error(e);

        return NextResponse.json(
            {
                ok: false,
                error: e instanceof Error ? e.message : "unknown error",
            },
            { status: 500 }
        );
    }
}