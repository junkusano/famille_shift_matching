import type {
  MonitoringAchievement,
  MonitoringServiceType,
  MonitoringStatus,
} from "@/types/monitoring";

export const MONITORING_STATUS_LABELS: Record<MonitoringStatus, string> = {
  draft: "下書き",
  ai_generated: "AI生成済み",
  confirmed: "確認済み",
  pdf_final: "PDF確定",
  fax_sent: "FAX送信済み",
};

export const MONITORING_SERVICE_LABELS: Record<MonitoringServiceType, string> = {
  care_insurance: "介護保険型",
  disability: "障害福祉等",
};

export const MONITORING_ACHIEVEMENT_LABELS: Record<MonitoringAchievement, string> = {
  achieved: "達成",
  partial: "一部達成",
  not_achieved: "未達成",
  insufficient_evidence: "記録不足・判断保留",
};

export function detectMonitoringServiceType(
  serviceKind: unknown,
  planDocumentKind?: unknown,
): MonitoringServiceType | null {
  const source = `${String(serviceKind ?? "")} ${String(planDocumentKind ?? "")}`;
  if (/要介護|要支援|介護保険|訪問介護サービス|訪問介護予防/.test(source)) {
    return "care_insurance";
  }
  if (/障害|移動支援|居宅介護|重度訪問|行動援護|同行援護/.test(source)) {
    return "disability";
  }
  return null;
}

export function validateMonitoringPeriod(start: string, end: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return "対象期間を正しい日付で指定してください";
  }
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "対象期間を正しい日付で指定してください";
  }
  if (startDate > endDate) return "開始日は終了日以前にしてください";
  const maxEnd = new Date(startDate);
  maxEnd.setUTCFullYear(maxEnd.getUTCFullYear() + 1);
  if (endDate >= maxEnd) return "一度に指定できる対象期間は12か月未満です";
  return null;
}

export function monthStart(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return "";
  return `${value}-01`;
}

export function monthEnd(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return "";
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function sanitizeEvidenceIds(value: unknown, allowedIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter((id) => allowedIds.has(id)))];
}

export function isMonitoringAchievement(value: unknown): value is MonitoringAchievement {
  return ["achieved", "partial", "not_achieved", "insufficient_evidence"].includes(
    String(value),
  );
}

export function formatMonitoringPeriod(start: string, end: string): string {
  const format = (value: string) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1/$2/$3");
  return `${format(start)} ～ ${format(end)}`;
}
