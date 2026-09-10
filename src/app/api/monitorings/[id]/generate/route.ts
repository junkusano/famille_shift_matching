import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { recordMonitoringEvent } from "@/lib/monitoring/audit";
import { loadMonitoringContext } from "@/lib/monitoring/context";
import { generateMonitoringWithAi } from "@/lib/monitoring/ai";
import { getMonitoringGoals, getMonitoringRecord } from "@/lib/monitoring/repository";
import { prepareMonitoringSignedPlan } from "@/lib/monitoring/signed-plan";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function monitoringPlanFields(context: {
  plan: Record<string, unknown> | null;
  signed_plan: { client_request: string; family_request: string; issues: string } | null;
}) {
  if (context.signed_plan) {
    return {
      client_request: context.signed_plan.client_request,
      family_request: context.signed_plan.family_request,
      issues: context.signed_plan.issues,
    };
  }
  return {
    client_request: text(context.plan?.person_family_hope),
    family_request: text(context.plan?.family_request),
    issues: text(context.plan?.identified_needs) || text(context.plan?.assistance_goal),
  };
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const { id } = await params;
    const monitoring = await getMonitoringRecord(id);
    if (!monitoring) {
      return NextResponse.json({ ok: false, error: "モニタリングが見つかりません" }, { status: 404 });
    }
    const { token } = await getUserFromBearer(request);
    if (!token) throw new Error("署名済みプランの準備に必要な認証情報を取得できません");
    await prepareMonitoringSignedPlan({
      kaipokeCsId: monitoring.kaipoke_cs_id,
      periodEnd: monitoring.period_end,
      accessToken: token,
    });
    const context = await loadMonitoringContext({
      clientInfoId: monitoring.client_info_id,
      periodStart: monitoring.period_start,
      periodEnd: monitoring.period_end,
      evaluationDate: monitoring.evaluation_date,
    });
    const generated = await generateMonitoringWithAi({
      context,
      serviceType: monitoring.service_type,
    });
    const planFields = monitoringPlanFields(context);
    const wasGenerated = monitoring.generated_by_ai;
    const { error: updateError } = await supabaseAdmin
      .from("client_monitorings")
      .update({
        client_request: planFields.client_request,
        family_request: planFields.family_request,
        issues: planFields.issues,
        summary: generated.summary,
        notable_observations: generated.notable_observations,
        monitoring_json: {
          summary: generated.summary,
          notable_observations: generated.notable_observations,
        },
        generated_by_ai: true,
        ai_model: generated.model,
        ai_generated_at: new Date().toISOString(),
        status: "ai_generated",
        current_pdf_snapshot_id: null,
        confirmed_by: null,
        confirmed_by_name: null,
        confirmed_at: null,
      })
      .eq("id", id);
    if (updateError) throw updateError;

    const goalRows = await getMonitoringGoals(id);
    for (const generatedGoal of generated.goals) {
      const goalRow = goalRows.find((goal) => goal.plan_goal_id === generatedGoal.goal_id);
      if (!goalRow) continue;
      const { error } = await supabaseAdmin
        .from("client_monitoring_goals")
        .update({
          achievement_status: generatedGoal.achievement,
          evaluation_text: generatedGoal.evaluation,
          review_required: generatedGoal.review_required,
          review_content: generatedGoal.review_content,
          ai_evidence_json: generatedGoal.evidence_record_ids,
          generated_by_ai: true,
        })
        .eq("id", goalRow.id)
        .eq("monitoring_id", id);
      if (error) throw error;
    }

    await recordMonitoringEvent({
      monitoringId: id,
      action: wasGenerated ? "ai_regenerate" : "ai_generate",
      actor,
      metadata: {
        model: generated.model,
        visit_record_count: context.visit_records.length,
        previous_monitoring_count: context.previous_monitorings.length,
      },
    });
    return NextResponse.json({ ok: true, data: { ...generated, ...planFields } });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
