import { NextRequest, NextResponse } from "next/server";
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

function getTargetMonth(req: NextRequest) {
    const ym = req.nextUrl.searchParams.get("ym");

    if (ym && /^\d{4}-\d{2}$/.test(ym)) {
        return `${ym}-01`;
    }

    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    if (currentYm < "2026-07") {
        return "2026-07-01";
    }

    return `${currentYm}-01`;
}

function calcVisitRecordScore(row: SummaryRow) {
    const total = Number(row.visit_record_total_count ?? 0);
    const sameDay = Number(row.houmon_same_day_done_count ?? 0);

    if (total <= 0) return 0;

    return Math.round((sameDay / total) * 30);
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

export async function GET(req: NextRequest) {
    try {
        const targetMonth = getTargetMonth(req);

        const { data: rows, error } = await supabaseAdmin
            .from("staff_monthly_score_summaries")
            .select("*")
            .eq("target_month", targetMonth)
            .returns<SummaryRow[]>();

        if (error) {
            throw error;
        }

        const scoredRows = (rows ?? [])
            .map((row) => ({
                ...row,
                total_score: calcTotalScore(row),
            }))
            .sort((a, b) => b.total_score - a.total_score);

        const updates = scoredRows.map((row, index) => ({
            id: row.id,
            target_month: row.target_month,
            user_id: row.user_id,
            entry_id: row.entry_id,
            staff_name: row.staff_name,
            service_hours: row.service_hours,
            visit_record_total_count: row.visit_record_total_count ?? 0,
            houmon_same_day_done_count: row.houmon_same_day_done_count ?? 0,
            houmon_late_done_count: row.houmon_late_done_count ?? 0,
            visit_record_current_month_incomplete_count:
                row.visit_record_current_month_incomplete_count ?? 0,
            visit_record_past_incomplete_count:
                row.visit_record_past_incomplete_count ?? 0,
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