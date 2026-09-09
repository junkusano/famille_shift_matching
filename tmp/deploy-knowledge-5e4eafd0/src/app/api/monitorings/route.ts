import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { recordMonitoringEvent } from "@/lib/monitoring/audit";
import { validateMonitoringPeriod } from "@/lib/monitoring/core";
import { loadMonitoringContext } from "@/lib/monitoring/context";
import type { MonitoringServiceType } from "@/types/monitoring";

export const dynamic = "force-dynamic";

function isServiceType(value: unknown): value is MonitoringServiceType {
  return value === "care_insurance" || value === "disability";
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireMonitoringActor(request);
    const clientInfoId = request.nextUrl.searchParams.get("client_info_id")?.trim();
    if (!clientInfoId) {
      return NextResponse.json({ ok: false, error: "client_info_id is required" }, { status: 400 });
    }
    const [{ data: client, error: clientError }, { data, error }] = await Promise.all([
      supabaseAdmin
        .from("cs_kaipoke_info")
        .select("id,kaipoke_cs_id,name,service_kind,care_consultant")
        .eq("id", clientInfoId)
        .maybeSingle(),
      supabaseAdmin
        .from("client_monitorings")
        .select("*")
        .eq("client_info_id", clientInfoId)
        .eq("is_deleted", false)
        .order("period_end", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    if (clientError) throw clientError;
    if (error) throw error;
    const monitorings = data ?? [];
    const ids = monitorings.map((row) => String(row.id));
    let histories: Array<Record<string, unknown>> = [];
    if (ids.length > 0) {
      const { data: historyRows, error: historyError } = await supabaseAdmin
        .from("monitoring_fax_history")
        .select("monitoring_id,status,sent_at,destination_name,contact_name,fax_number,created_at")
        .in("monitoring_id", ids)
        .order("created_at", { ascending: false });
      if (historyError) throw historyError;
      histories = (historyRows ?? []) as Array<Record<string, unknown>>;
    }
    const enriched = monitorings.map((monitoring) => ({
      ...monitoring,
      latest_fax:
        histories.find((history) => String(history.monitoring_id) === String(monitoring.id)) ?? null,
    }));
    return NextResponse.json({
      ok: true,
      data: enriched,
      client,
      permissions: { can_manage: actor.canManage },
    });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const body = (await request.json()) as Record<string, unknown>;
    const clientInfoId = String(body.client_info_id ?? "").trim();
    const periodStart = String(body.period_start ?? "").trim();
    const periodEnd = String(body.period_end ?? "").trim();
    const evaluationDate = String(body.evaluation_date ?? periodEnd).trim();
    if (!clientInfoId) {
      return NextResponse.json({ ok: false, error: "client_info_id is required" }, { status: 400 });
    }
    const periodError = validateMonitoringPeriod(periodStart, periodEnd);
    if (periodError) {
      return NextResponse.json({ ok: false, error: periodError }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evaluationDate)) {
      return NextResponse.json({ ok: false, error: "評価日を指定してください" }, { status: 400 });
    }

    const context = await loadMonitoringContext({ clientInfoId, periodStart, periodEnd });
    const requestedType = body.service_type;
    const serviceType = isServiceType(requestedType)
      ? requestedType
      : context.service_type_detected;
    if (!serviceType) {
      return NextResponse.json(
        { ok: false, error: "サービス種別を選択してください", requires_service_type: true },
        { status: 422 },
      );
    }

    const plan = context.plan ?? {};
    const { data: monitoring, error } = await supabaseAdmin
      .from("client_monitorings")
      .insert({
        client_info_id: clientInfoId,
        kaipoke_cs_id: String(context.client.kaipoke_cs_id ?? ""),
        service_type: serviceType,
        period_start: periodStart,
        period_end: periodEnd,
        evaluation_date: evaluationDate,
        status: "draft",
        assessment_id: context.assessment ? String(context.assessment.assessment_id ?? "") || null : null,
        plan_id: context.plan ? String(context.plan.plan_id ?? "") || null : null,
        client_request: String(plan.person_family_hope ?? ""),
        family_request: "",
        issues: String(plan.identified_needs ?? plan.assistance_goal ?? ""),
        office_notice: context.office_notice,
        created_by: actor.userId,
        created_by_name: actor.name,
      })
      .select("*")
      .single();
    if (error) throw error;

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
      if (goalError) {
        await supabaseAdmin.from("client_monitorings").update({ is_deleted: true }).eq("id", monitoring.id);
        throw goalError;
      }
    }

    await recordMonitoringEvent({
      monitoringId: monitoring.id,
      action: "create",
      actor,
      metadata: { period_start: periodStart, period_end: periodEnd, service_type: serviceType },
    });
    return NextResponse.json({ ok: true, data: monitoring }, { status: 201 });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
