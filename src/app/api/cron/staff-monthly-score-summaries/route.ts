//当月のみ更新変更箇所1
//import { NextRequest, NextResponse } from "next/server";
import { NextResponse } from "next/server";
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
    kaipoke_cs_id: string | null;
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
    record_status: string | null;
};

type IncompleteCount = {
    currentMonth: number;
    past: number;
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
//当月のみ更新変更箇所2 以下をコメントアウト
/*function getTargetMonth(req: NextRequest) {
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
}*/

function calcVisitRecordScore(row: SummaryRow) {
    const total = Number(row.visit_record_total_count ?? 0);
    const sameDay = Number(row.houmon_same_day_done_count ?? 0);
    const pastIncomplete = Number(row.visit_record_past_incomplete_count ?? 0);

    const baseScore = total <= 0 ? 30 : Math.round((sameDay / total) * 30);

    return baseScore - pastIncomplete * 5;
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

//当月のみ更新変更箇所３
//export async function GET(req: NextRequest) {
export async function GET() {
    try {
        const targetMonth = "2026-05-01";
        //当月のみ更新変更箇所４
        //const targetMonth = getTargetMonth(req);

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

        const { data: shiftRecordRows, error: shiftRecordError } = await supabaseAdmin
            .from("shift_shift_record_view")
            .select(
                "shift_start_date, kaipoke_cs_id, staff_01_user_id, staff_02_user_id, staff_03_user_id, record_status"
            )
            .gte("shift_start_date", "2025-11-01")
            .lt("shift_start_date", nextMonthStart)
            .returns<ShiftRecordViewRow[]>();

        if (shiftRecordError) {
            throw shiftRecordError;
        }

        const incompleteCountMap = new Map<string, IncompleteCount>();
        const submittedTotalCountMap = new Map<string, number>();
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
                shift.record_status === "submitted" &&
                shift.shift_start_date >= targetMonth &&
                shift.shift_start_date < currentMonthEndDate
            ) {
                for (const userId of [
                    shift.staff_01_user_id,
                    shift.staff_02_user_id,
                    shift.staff_03_user_id,
                ]) {
                    if (!userId) continue;

                    submittedTotalCountMap.set(
                        userId,
                        (submittedTotalCountMap.get(userId) ?? 0) + 1
                    );
                }
            }

            if (shift.record_status === "submitted") continue;

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
                    visit_record_total_count:
                        submittedTotalCountMap.get(row.user_id) ?? 0,
                    visit_record_current_month_incomplete_count:
                        incompleteCountMap.get(row.user_id)?.currentMonth ?? 0,
                    visit_record_past_incomplete_count:
                        incompleteCountMap.get(row.user_id)?.past ?? 0,
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
            service_hours: row.service_hours,
            visit_record_total_count:
                submittedTotalCountMap.get(row.user_id) ?? 0,
            houmon_same_day_done_count: row.houmon_same_day_done_count ?? 0,
            houmon_late_done_count: row.houmon_late_done_count ?? 0,
            visit_record_current_month_incomplete_count:
                incompleteCountMap.get(row.user_id)?.currentMonth ?? 0,
            visit_record_past_incomplete_count:
                incompleteCountMap.get(row.user_id)?.past ?? 0,
            meeting_previous_month_attended:
                row.meeting_previous_month_attended ?? false,
            meeting_past_attended: row.meeting_past_attended ?? false,
            jisseki_previous_month_done_count:
                row.jisseki_previous_month_done_count ?? 0,
            jisseki_past_incomplete_count:
                row.jisseki_past_incomplete_count ?? 0,
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