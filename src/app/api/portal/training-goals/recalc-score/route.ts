//api/portal/training-goals/recalc-score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const entryId = body.entry_id;
        //const ym = body.ym ?? new Date().toISOString().slice(0, 7);
        // const targetMonth = `${ym}-01`;

        if (!entryId) {
            return NextResponse.json({ error: "entry_id required" }, { status: 400 });
        }

        const { data: userRow, error: userError } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .eq("entry_id", entryId)
            .maybeSingle();

        if (userError) throw userError;
        if (!userRow?.user_id) {
            return NextResponse.json({ error: "user not found" }, { status: 404 });
        }

        const userId = userRow.user_id;

        const { count, error: countError } = await supabaseAdmin
            .from("employee_training_goals")
            .select("id", { count: "exact", head: true })
            .eq("entry_id", entryId)
            .eq("row_type", "goal")
            .eq("selected", true)
            .eq("watched", true);

        if (countError) throw countError;

        const trainingCount = count ?? 0;

        const { data: scoreRows, error: scoreError } = await supabaseAdmin
            .from("staff_monthly_score_summaries")
            .select(`
        target_month,
        service_hours,
        visit_record_total_count,
        houmon_same_day_done_count,
        visit_record_past_incomplete_count,
        meeting_previous_month_attended,
        meeting_past_attended,
        jisseki_previous_month_done_count
    `)
            .eq("user_id", userId);

        if (scoreError) throw scoreError;

        if (!scoreRows || scoreRows.length === 0) {
            return NextResponse.json(
                { error: "score summary not found" },
                { status: 404 }
            );
        }

        const updates = [];

        for (const scoreRow of scoreRows) {
            const serviceHoursScore = Math.min(
                80,
                Math.floor(Number(scoreRow.service_hours ?? 0) / 20) * 10
            );

            const visitRecordTotalCount = Number(scoreRow.visit_record_total_count ?? 0);
            const visitRecordSameDayCount = Number(scoreRow.houmon_same_day_done_count ?? 0);
            const visitRecordPastIncompleteCount = Number(scoreRow.visit_record_past_incomplete_count ?? 0);

            const visitRecordBaseScore =
                visitRecordTotalCount > 0
                    ? Math.round((visitRecordSameDayCount / visitRecordTotalCount) * 30)
                    : 0;

            const visitRecordScore =
                visitRecordBaseScore - visitRecordPastIncompleteCount * 5;

            const meetingScore =
                scoreRow.meeting_previous_month_attended === true ||
                    scoreRow.meeting_past_attended === true
                    ? 10
                    : 0;

            const jissekiScore =
                Number(scoreRow.jisseki_previous_month_done_count ?? 0) * 2;

            const trainingGoalScore = trainingCount * 5;

            const totalScore =
                serviceHoursScore +
                visitRecordScore +
                meetingScore +
                jissekiScore +
                trainingGoalScore;

            updates.push({
                target_month: scoreRow.target_month,
                user_id: userId,
                training_goal_selected_count: trainingCount,
                total_score: totalScore,
                updated_at: new Date().toISOString(),
            });
        }

        const { error: updateError } = await supabaseAdmin
            .from("staff_monthly_score_summaries")
            .upsert(updates, {
                onConflict: "target_month,user_id",
            });

        if (updateError) throw updateError;

        return NextResponse.json({
            ok: true,
            user_id: userId,
            training_goal_selected_count: trainingCount,
            updated_count: updates.length,
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "failed";

        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}