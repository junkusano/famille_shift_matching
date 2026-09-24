import type { MonitoringFaxTarget } from "@/types/monitoring";

function normalizeOfficeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[「」『』（）()・、，,./／]/g, "")
    .toLocaleLowerCase("ja-JP");
}

/** FAX台帳の宛先と契約情報の事業所名を突合し、両方ある場合の不一致だけ送信を止める。 */
export function validateMonitoringFaxTarget(target: MonitoringFaxTarget): string | null {
  if (!target.fax_id || !target.office_name || !target.fax_number) {
    return "FAX送信先の事業所名・FAX番号・台帳IDが揃っていません。契約情報とFAX電話帳を確認してください。";
  }
  const registeredOffice = target.registered_office_name?.trim() ?? "";
  if (
    registeredOffice &&
    normalizeOfficeName(target.office_name) !== normalizeOfficeName(registeredOffice)
  ) {
    return `FAX送信先が契約情報と一致しません（契約情報: ${registeredOffice} / FAX台帳: ${target.office_name}）。送信先を確認してから再実行してください。`;
  }
  return null;
}
