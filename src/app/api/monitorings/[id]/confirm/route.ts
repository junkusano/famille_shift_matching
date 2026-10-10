import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { recordMonitoringEvent } from "@/lib/monitoring/audit";
import { loadMonitoringContext } from "@/lib/monitoring/context";
import { getMonitoringGoals, getMonitoringRecord } from "@/lib/monitoring/repository";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const { id } = await params;
    const monitoring = await getMonitoringRecord(id);
    if (!monitoring) {
      return NextResponse.json({ ok: false, error: "モニタリングが見つかりません" }, { status: 404 });
    }
    let goals = await getMonitoringGoals(id);
    if (!monitoring.summary.trim()) {
      return NextResponse.json(
        { ok: false, error: "全体経過（モニタリング本文）を入力してください" },
        { status: 400 },
      );
    }
    if (monitoring.service_type === "care_insurance" && goals.length === 0) {
      const context = await loadMonitoringContext({
        clientInfoId: monitoring.client_info_id,
        periodStart: monitoring.period_start,
        periodEnd: monitoring.period_end,
        evaluationDate: monitoring.evaluation_date,
      });
      if (context.goals.length > 0) {
        const { error: goalError } = await supabaseAdmin.from("client_monitoring_goals").insert(
          context.goals.map((goal, index) => ({
            monitoring_id: monitoring.id,
            plan_goal_id: goal.goal_id,
            parent_plan_goal_id: goal.parent_goal_id,
            goal_type: goal.goal_type,
            goal_text: goal.goal_text,
            evaluation_start: goal.evaluation_start,
            evaluation_end: goal.evaluation_end,
            sort_order: index,
          })),
        );
        if (goalError) throw goalError;
        goals = await getMonitoringGoals(id);
      }
    }
    if (monitoring.service_type === "care_insurance" && goals.length === 0) {
      return NextResponse.json(
        { ok: false, error: "介護保険型の確定には評価対象の目標が必要です" },
        { status: 400 },
      );
    }
    const confirmedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("client_monitorings")
      .update({
        status: "confirmed",
        confirmed_by: actor.userId,
        confirmed_by_name: actor.name,
        confirmed_at: confirmedAt,
        current_pdf_snapshot_id: null,
      })
      .eq("id", id);
    if (error) throw error;
    await recordMonitoringEvent({
      monitoringId: id,
      action: "confirm",
      actor,
      metadata: { confirmed_at: confirmedAt },
    });
    return NextResponse.json({ ok: true, confirmed_at: confirmedAt });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
