import "server-only";

import { supabaseAdmin } from "@/lib/supabase/service";
import type { MonitoringServiceType } from "@/types/monitoring";
import { monitoringYearMonth } from "./core";

export type MonitoringMonthlyNotice = {
  id: string;
  service_type: MonitoringServiceType;
  year_month: string;
  body: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export function isYearMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export async function getMonitoringMonthlyNotice(params: {
  serviceType: MonitoringServiceType;
  periodEnd: string;
}): Promise<MonitoringMonthlyNotice | null> {
  const yearMonth = monitoringYearMonth(params.periodEnd);
  if (!yearMonth) return null;

  const { data, error } = await supabaseAdmin
    .from("monitoring_monthly_notices")
    .select("id,service_type,year_month,body,created_by,updated_by,created_at,updated_at")
    .eq("service_type", params.serviceType)
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (error) throw error;
  return (data as MonitoringMonthlyNotice | null) ?? null;
}
