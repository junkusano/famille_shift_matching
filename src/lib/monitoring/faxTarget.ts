import type { MonitoringFaxTarget } from "@/types/monitoring";

export type MonitoringDeliveryMethod = "fax" | "email";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOfficeName(value: unknown): string {
  return text(value)
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[「」『』（）()・、，,./／]/g, "")
    .toLocaleLowerCase("ja-JP");
}

/** FAX台帳の宛先と契約情報の事業所名を突合し、両方ある場合の不一致だけ送信を止める。 */
export function validateMonitoringFaxTarget(target: MonitoringFaxTarget): string | null {
  if (!target.fax_id || !target.office_name) {
    return "送付先の事業所名・FAX電話帳IDが揃っていません。契約情報とFAX電話帳を確認してください。";
  }
  if (!monitoringDeliveryMethod(target)) {
    return "送付先の有効なメールアドレスまたはFAX番号が登録されていません。FAX電話帳を確認してください。";
  }
  const registeredOffice = text(target.registered_office_name);
  if (
    registeredOffice &&
    normalizeOfficeName(target.office_name) !== normalizeOfficeName(registeredOffice)
  ) {
    return `FAX送信先が契約情報と一致しません（契約情報: ${registeredOffice} / FAX台帳: ${target.office_name}）。送信先を確認してから再実行してください。`;
  }
  return null;
}

export function hasMonitoringEmailAddress(target: MonitoringFaxTarget): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(target.email_address));
}

export function hasUsableMonitoringFaxNumber(target: MonitoringFaxTarget): boolean {
  const normalized = text(target.fax_number).replace(/[\s()-]/g, "");
  return /^\d{1,20}$/.test(normalized);
}

/** FAX番号が有効ならFAXを使用し、FAXが使えないときだけメールで送付する。 */
export function monitoringDeliveryMethod(target: MonitoringFaxTarget): MonitoringDeliveryMethod | null {
  if (hasUsableMonitoringFaxNumber(target)) return "fax";
  if (hasMonitoringEmailAddress(target)) return "email";
  return null;
}
