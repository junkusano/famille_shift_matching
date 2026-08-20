import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { recordMonitoringEvent } from "@/lib/monitoring/audit";
import { isMonitoringAchievement, sanitizeEvidenceIds } from "@/lib/monitoring/core";
import { loadMonitoringContext } from "@/lib/monitoring/context";
import { getMonitoringGoals, getMonitoringRecord } from "@/lib/monitoring/repository";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const actor = await requireMonitoringActor(request);
    const { id } = await params;
    const monitoring = await getMonitoringRecord(id);
    if (!monitoring) {
      return NextResponse.json({ ok: false, error: "モニタリングが見つかりません" }, { status: 404 });
    }
    const [goals, context, faxHistoryResult, snapshotsResult, eventsResult] = await Promise.all([
      getMonitoringGoals(id),
      loadMonitoringContext({
        clientInfoId: monitoring.client_info_id,
        periodStart: monitoring.period_start,
        periodEnd: monitoring.period_end,
      }),
      supabaseAdmin
        .from("monitoring_fax_history")
        .select("*")
        .eq("monitoring_id", id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("client_monitoring_pdf_snapshots")
        .select("id,version_no,filename,content_hash,created_by,created_by_name,created_at")
        .eq("monitoring_id", id)
        .order("version_no", { ascending: false }),
      supabaseAdmin
        .from("client_monitoring_events")
        .select("id,action,actor_user_id,actor_name,metadata,created_at")
        .eq("monitoring_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (faxHistoryResult.error) throw faxHistoryResult.error;
    if (snapshotsResult.error) throw snapshotsResult.error;
    if (eventsResult.error) throw eventsResult.error;
    return NextResponse.json({
      ok: true,
      data: {
        monitoring,
        goals,
        context,
        fax_history: faxHistoryResult.data ?? [],
        pdf_snapshots: snapshotsResult.data ?? [],
        events: eventsResult.data ?? [],
        permissions: { can_manage: actor.canManage },
      },
    });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const { id } = await params;
    const monitoring = await getMonitoringRecord(id);
    if (!monitoring) {
      return NextResponse.json({ ok: false, error: "モニタリングが見つかりません" }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const context = await loadMonitoringContext({
      clientInfoId: monitoring.client_info_id,
      periodStart: monitoring.period_start,
      periodEnd: monitoring.period_end,
    });
    const allowedEvidenceIds = new Set(context.visit_records.map((visit) => visit.evidence_id));
    const invalidatesPdf = ["confirmed", "pdf_final", "fax_sent"].includes(monitoring.status);
    const notable = Array.isArray(body.notable_observations)
      ? body.notable_observations.map(String).map((value) => value.trim()).filter(Boolean)
      : monitoring.notable_observations;
    const evaluationDate = text(body.evaluation_date) || monitoring.evaluation_date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evaluationDate)) {
      return NextResponse.json({ ok: false, error: "評価日を指定してください" }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("client_monitorings")
      .update({
        evaluation_date: evaluationDate,
        client_request: text(body.client_request),
        family_request: text(body.family_request),
        issues: text(body.issues),
        summary: text(body.summary),
        notable_observations: notable,
        office_notice: text(body.office_notice),
        monitoring_json: { summary: text(body.summary), notable_observations: notable },
        ...(invalidatesPdf
          ? { status: "draft", current_pdf_snapshot_id: null, confirmed_by: null, confirmed_by_name: null, confirmed_at: null }
          : {}),
      })
      .eq("id", id);
    if (updateError) throw updateError;

    const goals = Array.isArray(body.goals) ? body.goals : [];
    for (const candidate of goals) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const goal = candidate as Record<string, unknown>;
      const goalId = text(goal.id).trim();
      if (!goalId) continue;
      const achievement = isMonitoringAchievement(goal.achievement_status)
        ? goal.achievement_status
        : "insufficient_evidence";
      const { error } = await supabaseAdmin
        .from("client_monitoring_goals")
        .update({
          achievement_status: achievement,
          evaluation_text: text(goal.evaluation_text),
          review_required: goal.review_required === true,
          review_content: text(goal.review_content),
          ai_evidence_json: sanitizeEvidenceIds(goal.ai_evidence_json, allowedEvidenceIds),
        })
        .eq("id", goalId)
        .eq("monitoring_id", id);
      if (error) throw error;
    }

    await recordMonitoringEvent({
      monitoringId: id,
      action: "edit",
      actor,
      metadata: { invalidated_pdf: invalidatesPdf },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const { id } = await params;
    const monitoring = await getMonitoringRecord(id);
    if (!monitoring) {
      return NextResponse.json({ ok: false, error: "モニタリングが見つかりません" }, { status: 404 });
    }
    const { count, error: historyError } = await supabaseAdmin
      .from("monitoring_fax_history")
      .select("id", { count: "exact", head: true })
      .eq("monitoring_id", id);
    if (historyError) throw historyError;
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { ok: false, error: "FAX送信履歴があるモニタリングは削除できません" },
        { status: 409 },
      );
    }
    await recordMonitoringEvent({ monitoringId: id, action: "delete", actor });
    const { error } = await supabaseAdmin
      .from("client_monitorings")
      .update({ is_deleted: true })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
