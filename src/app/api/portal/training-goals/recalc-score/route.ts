//api/portal/training-goals/recalc-score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const entryId = body.entry_id;

        const now = new Date();
        const tokyoNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

        const year = tokyoNow.getFullYear();
        const month = tokyoNow.getMonth();

        const targetMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;

        const monthStart = new Date(Date.UTC(year, month, 1, -9, 0, 0));
        const monthEnd = new Date(Date.UTC(year, month + 1, 1, -9, 0, 0));


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
            .eq("watched", true)
            .gte("updated_at", monthStart.toISOString())
            .lt("updated_at", monthEnd.toISOString());

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
        jisseki_past_incomplete_count,
        shift_decline_penalty_score
    `)
            .eq("user_id", userId)
            .eq("target_month", targetMonth);

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

            const jissekiScore = Math.max(
                0,
                20 - Number(scoreRow.jisseki_past_incomplete_count ?? 0) * 5
            );

            const trainingGoalScore = trainingCount * 5;

            const shiftDeclinePenaltyScore = Number(
                scoreRow.shift_decline_penalty_score ?? 0
            );

            const totalScore =
                serviceHoursScore +
                visitRecordScore +
                meetingScore +
                jissekiScore +
                trainingGoalScore -
                shiftDeclinePenaltyScore;

            updates.push({
                target_month: targetMonth,
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