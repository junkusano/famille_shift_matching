import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { recordMonitoringEvent } from "@/lib/monitoring/audit";
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
    const goals = await getMonitoringGoals(id);
    if (!monitoring.summary.trim()) {
      return NextResponse.json(
        { ok: false, error: "全体経過（モニタリング本文）を入力してください" },
        { status: 400 },
      );
    }
    if (monitoring.service_type === "care_insurance" && goals.length === 0) {
      return NextResponse.json(
        { ok: false, error: "介護保険型の確定には評価対象の目標が必要です" },
        { status: 400 },
      );
    }
    const missingEvaluation = goals.find((goal) => !goal.evaluation_text.trim());
    if (missingEvaluation) {
      return NextResponse.json(
        { ok: false, error: `「${missingEvaluation.goal_text}」の評価文を入力してください` },
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
