import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { sendTrainingGoalRemarkToLineworks } from "@/lib/training_goals/sendTrainingGoalRemarkToLineworks";

export const runtime = "nodejs";

type Body = {
    entry_id?: string;
    remark?: string;
    notify_type?: "remark" | "selected" | "watched";
    goal_title?: string;
    training_goal?: string | null;
};

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as Body;

        const entryId = String(body.entry_id ?? "").trim();
        const remark = String(body.remark ?? "").trim();
        const notifyType = body.notify_type ?? "remark";
        const goalTitle = String(body.goal_title ?? "").trim();
        const trainingGoal = body.training_goal ?? null;

        if (!entryId) {
            return NextResponse.json({ ok: false, error: "entry_id required" }, { status: 400 });
        }

        if (notifyType === "remark" && !remark) {
            return NextResponse.json({ ok: false, error: "remark required" }, { status: 400 });
        }

        const now = new Date().toISOString();

        const { error: upsertError } = await supabaseAdmin
            .from("employee_training_goals")
            .upsert(
                {
                    entry_id: entryId,
                    goal_key: "__remark__",
                    goal_title: "追加目標・追加研修",
                    video_url: null,
                    selected: false,
                    watched: false,
                    remark,
                    sort_order: 999999,
                    category: "備考",
                    group_code: null,
                    target_condition: null,
                    training_goal: null,
                    row_type: "remark",
                    updated_at: now,
                },
                { onConflict: "entry_id,goal_key" }
            );

        if (upsertError) {
            throw new Error(`employee_training_goals upsert failed: ${upsertError.message}`);
        }

        const notifyResult = await sendTrainingGoalRemarkToLineworks({
            entryId,
            remark,
            notifyType,
            goalTitle,
            trainingGoal,
        });

        return NextResponse.json({
            ok: true,
            message: "備考を保存し、LINEWORKSへ通知しました。",
            notifyResult,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[training-goals/notify] error", msg);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}