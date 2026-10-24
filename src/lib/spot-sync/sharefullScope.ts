/**
 * Sharefull連携の対象利用者を限定する安全弁。
 *
 * 初期値は2026-10-23時点の有効利用者658人の半数329人に固定する。
 * 既存13人を保持し、有効テンプレートがある人を優先、残りはID昇順で選定。
 * 利用者の増減では自動的に入れ替えない。全利用者へ広げる場合は、
 * SHAREFULL_SYNC_KAIPOKE_CS_IDS=* と SHAREFULL_SYNC_ALLOW_ALL=true を
 * 明示的に両方設定する。
 */
const DEFAULT_TARGET_CLIENT_IDS = [
  "8111577",
  "10857804",
  "12278553",
  "12581399",
  "12666844",
  "12698444",
  "12782561",
  "12906710",
  "12988540",
  "8065144",
  "9003819",
  "13611106",
  "13673338",
  "5669896",
  "7142812",
  "7310167",
  "7518840",
  "7907069",
  "7946289",
  "8089938",
  "8367447",
  "8652500",
  "8666352",
  "8753056",
  "8753063",
  "8753079",
  "9275962",
  "9493132",
  "9565248",
  "9626745",
  "9630557",
  "9666215",
  "9735679",
  "9811121",
  "9914819",
  "10130771",
  "10154342",
  "10208818",
  "10254324",
  "10420968",
  "10445617",
  "10484630",
  "10493640",
  "10507095",
  "10558249",
  "10615712",
  "10616920",
  "10678490",
  "10687559",
  "10697607",
  "10754372",
  "10777437",
  "10839245",
  "10965908",
  "11077998",
  "11078201",
  "11078434",
  "11110097",
  "11116088",
  "11121519",
  "11218197",
  "11383191",
  "11388655",
  "11522009",
  "11595078",
  "11624595",
  "11768327",
  "11838644",
  "11881352",
  "11885882",
  "11905789",
  "12038963",
  "12062639",
  "12075913",
  "12089693",
  "12093960",
  "12142912",
  "12174162",
  "12188071",
  "12245449",
  "12295484",
  "12298360",
  "12333752",
  "12369990",
  "12397926",
  "12401412",
  "12541129",
  "12546216",
  "12572487",
  "12579562",
  "12579608",
  "12582980",
  "12598043",
  "12621481",
  "12621529",
  "12622493",
  "12628251",
  "12628415",
  "12631218",
  "12632556",
  "12668637",
  "12668718",
  "12668737",
  "12677339",
  "12687082",
  "12703068",
  "12739403",
  "12752149",
  "12754587",
  "12764411",
  "12769918",
  "12783043",
  "12816394",
  "12838305",
  "12861155",
  "12862027",
  "12863087",
  "12865891",
  "12866041",
  "12871212",
  "12876845",
  "12901759",
  "12905941",
  "12912374",
  "12916857",
  "12940450",
  "12940678",
  "12940683",
  "13000512",
  "13006004",
  "13011129",
  "13012202",
  "13037131",
  "13038621",
  "13061351",
  "13066538",
  "13070940",
  "13097001",
  "13127133",
  "13127160",
  "13134428",
  "13134536",
  "13139244",
  "13139698",
  "13157562",
  "13172470",
  "13181401",
  "13236776",
  "13259781",
  "13307133",
  "13311169",
  "13330838",
  "13387875",
  "13418985",
  "13422759",
  "13433208",
  "13489427",
  "13489561",
  "13494119",
  "13499541",
  "13509999",
  "13527928",
  "13527987",
  "13533067",
  "13541288",
  "13546693",
  "13576527",
  "13592934",
  "13593460",
  "13598186",
  "13606790",
  "13612631",
  "13619155",
  "13623198",
  "13628190",
  "13660019",
  "13677837",
  "13688782",
  "13706537",
  "13727751",
  "13743341",
  "13845590",
  "13860713",
  "13910300",
  "3896241",
  "4294312",
  "4296225",
  "4333975",
  "4352893",
  "4388154",
  "5104768",
  "5140281",
  "5189940",
  "5231486",
  "5297629",
  "5864776",
  "5873686",
  "5889338",
  "5933300",
  "5998628",
  "6095149",
  "6110439",
  "6200524",
  "6298798",
  "6401783",
  "6497030",
  "6788220",
  "6832375",
  "6885147",
  "7108112",
  "7108131",
  "7108179",
  "7108199",
  "7109013",
  "7109228",
  "7224249",
  "7269152",
  "7292992",
  "7300605",
  "7310056",
  "7310149",
  "7310186",
  "7323595",
  "7327580",
  "7518951",
  "7518965",
  "7539557",
  "7604988",
  "7610997",
  "7624175",
  "7654449",
  "7695810",
  "7719771",
  "7861289",
  "7941630",
  "7942948",
  "7949866",
  "7997132",
  "8088456",
  "8092411",
  "8123316",
  "8134779",
  "8155020",
  "8156810",
  "8175560",
  "8180212",
  "8213423",
  "8222867",
  "8247072",
  "8257540",
  "8324774",
  "8430272",
  "8534281",
  "8548734",
  "8643551",
  "8737711",
  "8753058",
  "8753060",
  "8753061",
  "8753064",
  "8753073",
  "8802558",
  "8855682",
  "8860093",
  "9003949",
  "9009070",
  "9079966",
  "9160263",
  "9249135",
  "9252606",
  "9300118",
  "9329121",
  "9332113",
  "9376889",
  "9546224",
  "9562527",
  "9615324",
  "9615345",
  "9653672",
  "9695840",
  "9697603",
  "9803907",
  "9833184",
  "9853821",
  "9891964",
  "9902443",
  "9935384",
  "9937470",
  "9945759",
  "9994255",
  "9996150",
  "10034284",
  "10138973",
  "10152397",
  "10152815",
  "10188337",
  "10250850",
  "10254312",
  "10296927",
  "10306820",
  "10312642",
  "10342792",
  "10352242",
  "10362651",
  "10386895",
  "10392653",
  "10399173",
  "10402929",
  "10423177",
  "10439586",
  "10439999",
  "10485262",
  "10528177",
  "10541010",
  "10551084",
  "10552683",
  "10557398",
  "10586300",
  "10586322",
  "10588893",
  "10631215",
  "10635482",
  "10654393",
  "10659329",
  "10663755",
  "10681096",
  "10688048",
  "10689387",
  "10741131",
];

export type SharefullRpaMode = "production" | "test";

export function sharefullTargetRunnerId(): string | null {
  if (sharefullRpaMode() !== "test") return null;
  const id = process.env.SHAREFULL_TEST_RUNNER_ID?.trim();
  return id || "sharefull-test-runner";
}

export function sharefullRpaMode(): SharefullRpaMode {
  return process.env.SHAREFULL_RPA_MODE?.trim().toLowerCase() === "test"
    ? "test"
    : "production";
}

export function shouldRunSharefullDecisionMonitor(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.SHAREFULL_DECISION_MONITOR_ENABLED?.trim().toLowerCase() === "true"
    && env.SHAREFULL_TEST_DEPLOYMENT?.trim().toLowerCase() === "true"
    && env.SHAREFULL_RPA_MODE?.trim().toLowerCase() === "test";
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

export function sharefullDecisionStatusTableName(): string {
  return sharefullRpaMode() === "test"
    ? "sharefull_rpa_test_decision_status"
    : "sharefull_decision_status";
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
    return DEFAULT_TARGET_CLIENT_IDS;
  }

  const ids = (configured ?? DEFAULT_TARGET_CLIENT_IDS.join(","))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)] : DEFAULT_TARGET_CLIENT_IDS;
}

export function isSharefullSyncClient(kaipokeCsId: unknown, record?: Record<string, unknown>): boolean {
  if (sharefullRpaMode() === "test") return true;
  // Office recruitment is explicitly registered by service_role, never by
  // inventing a client/shift identity. SQL constraints guard this discriminator.
  if (record?.recruitment_kind === "office" && record.core_id && !kaipokeCsId) return true;
  const clientIds = sharefullSyncClientIds();
  return clientIds === null || clientIds.includes(String(kaipokeCsId ?? "").trim());
}

/** Combine the existing client scope with explicitly approved office records. */
export function sharefullScopeFilter(clientIds: readonly string[]): string {
  return `kaipoke_cs_id.in.(${clientIds.join(",")}),recruitment_kind.eq.office`;
}

export function sharefullSyncScopeLabel(): string {
  if (sharefullRpaMode() === "test") return "test";
  const clientIds = sharefullSyncClientIds();
  return clientIds === null ? "all" : clientIds.join(",");
}
