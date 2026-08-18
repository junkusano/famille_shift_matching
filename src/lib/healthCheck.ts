export type HealthCheckType = "employment" | "periodic" | "unknown";

// A health-result attachment plus a valid examination date is the submitted health record.
// Some historical records remained in workflow draft after upload, so workflow approval
// status must not make an already registered health check disappear from annual scoring.
export const HEALTH_CHECK_SUBMITTED_STATUSES = ["draft", "submitted", "approved", "completed"] as const;

/** Japanese fiscal year: April 1 through March 31. Date-only values are intentional. */
export function getHealthCheckFiscalYear(value: string | Date = new Date()): number {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  if (Number.isNaN(date.getTime())) throw new Error("Invalid health check date");
  return date.getFullYear() - (date.getMonth() < 3 ? 1 : 0);
}

export function getHealthCheckFiscalYearRange(fiscalYear: number) {
  return {
    startDate: `${fiscalYear}-04-01`,
    endDate: `${fiscalYear + 1}-03-31`,
  };
}

export function getHealthCheckDate(payload: unknown, fallback?: string | null): string | null {
  const value = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).health_check_date
    : null;
  const date = typeof value === "string" ? value.slice(0, 10) : fallback?.slice(0, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function getHealthCheckType(payload: unknown): HealthCheckType {
  const value = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).health_check_type
    : null;
  return value === "employment" || value === "periodic" ? value : "unknown";
}

export function isHealthCheckForFiscalYear(
  payload: unknown,
  fiscalYear: number,
  fallbackDate?: string | null,
) {
  const date = getHealthCheckDate(payload, fallbackDate);
  return Boolean(date && getHealthCheckFiscalYear(date) === fiscalYear);
}
