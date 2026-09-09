import { NextRequest, NextResponse } from "next/server";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { validateMonitoringPeriod } from "@/lib/monitoring/core";
import { loadMonitoringContext } from "@/lib/monitoring/context";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireMonitoringActor(request, { manage: true });
    const body = (await request.json()) as Record<string, unknown>;
    const clientInfoId = String(body.client_info_id ?? "").trim();
    const periodStart = String(body.period_start ?? "").trim();
    const periodEnd = String(body.period_end ?? "").trim();
    if (!clientInfoId) {
      return NextResponse.json({ ok: false, error: "client_info_id is required" }, { status: 400 });
    }
    const periodError = validateMonitoringPeriod(periodStart, periodEnd);
    if (periodError) {
      return NextResponse.json({ ok: false, error: periodError }, { status: 400 });
    }
    const context = await loadMonitoringContext({ clientInfoId, periodStart, periodEnd });
    return NextResponse.json({ ok: true, data: context });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
