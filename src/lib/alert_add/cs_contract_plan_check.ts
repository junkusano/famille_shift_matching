// /src/lib/alert_add/cs_contract_plan_check.ts
//
// 契約書・計画書不足アラートを alert_log に投入するラッパ。
// 判定ロジック自体は /src/lib/cs_contract_plan.ts に集約。

import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";
import {
  type ContractPlanScanOptions,
  type ContractPlanScanResult,
  type ClientMissingDocs,
  type MissingDoc,
  findClientsMissingContractAndPlanDocs,
} from "@/lib/cs_contract_plan";

export type CsContractPlanCheckOptions = ContractPlanScanOptions;

export type CsContractPlanCheckResult = {
  scanned: number; // 対象期間内のシフト件数
  alertsCreated: number;
  alertsUpdated: number;
};

export async function runCsContractPlanCheck(
  options?: CsContractPlanCheckOptions,
): Promise<CsContractPlanCheckResult> {
  const scan: ContractPlanScanResult =
    await findClientsMissingContractAndPlanDocs(options);

  const { scannedShifts, clients } = scan;

  if (clients.length === 0) {
    console.info("[cs_contract_plan_check] no missing docs found", {
      scannedShifts,
    });
    return { scanned: scannedShifts, alertsCreated: 0, alertsUpdated: 0 };
  }

  let alertsCreated = 0;
  let alertsUpdated = 0;

  for (const client of clients) {
    const message = buildAlertMessage(client);

    const result = await ensureSystemAlert({
      message,
      kaipoke_cs_id: client.kaipoke_cs_id,
      shift_id: null,
      user_id: null,
      rpa_request_id: null,
    });

    if (result.created) alertsCreated += 1;
    else alertsUpdated += 1;
  }

  console.info("[cs_contract_plan_check] done", {
    scannedShifts,
    alertsCreated,
    alertsUpdated,
  });

  return {
    scanned: scannedShifts,
    alertsCreated,
    alertsUpdated,
  };
}

const CLIENT_DETAIL_BASE_URL =
  "https://myfamille.shi-on.net/portal/kaipoke-info-detail";

function buildAlertMessage(client: ClientMissingDocs): string {
  const link = `<a href="${CLIENT_DETAIL_BASE_URL}/${client.clientId}">${client.name}様</a>`;

  const servicePart = buildServicePart(client.relatedServiceCodes);
  const docPart = buildDocPart(client.missingDocs);

  // ex
  // <a href=".../利用者uuid">●●様</a>には 訪問介護サービス等を実施していますが、
  // 必要な書類（居宅介護契約書 と 個別支援計画）が利用者情報へ格納されていません。...
  return `${link}には ${servicePart}等を実施していますが、必要な書類（${docPart}）が利用者情報へ格納されていません。書類の作成＆サイン受領を実施してください。`;
}

function buildServicePart(serviceCodes: string[]): string {
  if (serviceCodes.length === 0) return "各種サービス";

  const unique = Array.from(new Set(serviceCodes));

  if (unique.length === 1) return `${unique[0]}サービス`;
  if (unique.length === 2) return `${unique[0]}・${unique[1]}サービス`;

  // 3つ以上ある場合は 2つ + 「等」
  return `${unique[0]}・${unique[1]}サービス`;
}

function buildDocPart(missingDocs: MissingDoc[]): string {
  if (missingDocs.length === 0) return "契約書・計画書";

  const labels = missingDocs.map((d) => d.docLabel || `書類(${d.docId})`);

  // 「A」「A・B」「A・B・C」… のように連結
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]}・${labels[1]}`;

  return labels.join("・");
}
