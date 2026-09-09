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
  evaluationDate: string;
}): Promise<MonitoringMonthlyNotice | null> {
  const yearMonth = monitoringYearMonth(params.evaluationDate);
  if (!yearMonth) return null;

  const { data, error } = await supabaseAdmin
    .from("monitoring_monthly_notices")
    .select("id,service_type,year_month,body,created_by,updated_by,created_at,updated_at")
    .eq("service_type", params.serviceType)
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as MonitoringMonthlyNotice;

  // The administrator screen manages one common notice for every monitoring.
  // It is currently stored under care_insurance, so use it until a
  // service-specific notice exists for the requested service type.
  if (params.serviceType === "care_insurance") return null;
  const { data: commonData, error: commonError } = await supabaseAdmin
    .from("monitoring_monthly_notices")
    .select("id,service_type,year_month,body,created_by,updated_by,created_at,updated_at")
    .eq("service_type", "care_insurance")
    .eq("year_month", yearMonth)
    .maybeSingle();
  if (commonError) throw commonError;
  return (commonData as MonitoringMonthlyNotice | null) ?? null;
}
