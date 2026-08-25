import "server-only";

import { buildMonitoringPdfFilename } from "@/lib/monitoring/core";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { MonitoringGoal, MonitoringRecord } from "@/types/monitoring";

export async function getMonitoringRecord(id: string): Promise<MonitoringRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("client_monitorings")
    .select("*")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw error;
  return (data as MonitoringRecord | null) ?? null;
}

export async function getMonitoringGoals(id: string): Promise<MonitoringGoal[]> {
  const { data, error } = await supabaseAdmin
    .from("client_monitoring_goals")
    .select("*")
    .eq("monitoring_id", id)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MonitoringGoal[]).map((goal) => ({
    ...goal,
    ai_evidence_json: Array.isArray(goal.ai_evidence_json) ? goal.ai_evidence_json : [],
  }));
}

export function monitoringFilename(
  monitoring: MonitoringRecord,
  version: number,
  clientName: unknown,
): string {
  return buildMonitoringPdfFilename({
    clientName,
    periodEnd: monitoring.period_end,
    version,
  });
}
