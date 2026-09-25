/**
 * Sharefull連携の対象利用者を限定する安全弁。
 *
 * 初期値は今回の検証利用者だけに固定する。全利用者へ広げる場合は、
 * SHAREFULL_SYNC_KAIPOKE_CS_IDS=* と SHAREFULL_SYNC_ALLOW_ALL=true を
 * 明示的に両方設定する。
 */
const DEFAULT_TEST_CLIENT_IDS = ["12782561"];

export type SharefullRpaMode = "production" | "test";

export function sharefullRpaMode(): SharefullRpaMode {
  return process.env.SHAREFULL_RPA_MODE?.trim().toLowerCase() === "test"
    ? "test"
    : "production";
}

export function sharefullTemplateTableName(): string {
  return sharefullRpaMode() === "test"
    ? "sharefull_rpa_test_spot_offer_template_unified"
    : "spot_offer_template_unified";
}

export function sharefullRequestTableName(): string {
  return sharefullRpaMode() === "test"
    ? "sharefull_rpa_test_spot_offer_request_table"
    : "spot_offer_request_table";
}

export function sharefullApplicationTableName(): string {
  return sharefullRpaMode() === "test"
    ? "sharefull_rpa_test_spot_offer_applications"
    : "spot_offer_applications";
}

function configuredValue(): string | undefined {
  const value = process.env.SHAREFULL_SYNC_KAIPOKE_CS_IDS?.trim();
  return value || undefined;
}

export function sharefullSyncClientIds(): string[] | null {
  if (sharefullRpaMode() === "test") return null;
  const configured = configuredValue();
  if (configured === "*") {
    if (process.env.SHAREFULL_SYNC_ALLOW_ALL?.trim().toLowerCase() === "true") {
      return null;
    }
    // * だけで全利用者に影響しないよう、明示許可がない時は検証対象へ戻す。
    return DEFAULT_TEST_CLIENT_IDS;
  }

  const ids = (configured ?? DEFAULT_TEST_CLIENT_IDS.join(","))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)] : DEFAULT_TEST_CLIENT_IDS;
}

export function isSharefullSyncClient(kaipokeCsId: unknown): boolean {
  if (sharefullRpaMode() === "test") return true;
  const clientIds = sharefullSyncClientIds();
  return clientIds === null || clientIds.includes(String(kaipokeCsId ?? "").trim());
}

export function sharefullSyncScopeLabel(): string {
  if (sharefullRpaMode() === "test") return "test";
  const clientIds = sharefullSyncClientIds();
  return clientIds === null ? "all" : clientIds.join(",");
}
