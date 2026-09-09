// /lib/certificateJudge.ts

export type ServiceKey =
  | 'home_help'
  | 'heavy_help'
  | 'mobility'
  | 'care_manager'
  | 'disability_home'
  | 'other'
  | (string); // 現状のdoc_group（日本語含む）も許容

export type DocMasterRow = {
  category: string;
  label: string | null;
  // supabaseで select('..., service_key:doc_group') とalias取得推奨
  service_key?: string | string[] | null;
  // 念のため素の列名も受ける（直参照時用）
  doc_group?: string | string[] | null;
  is_active?: boolean | null;
  sort_order?: number | null;
};

export type DocItemLite = { label?: string | null; type?: string | null };

/** ラベルの正規化（改行・半角/全角空白の除去 + trim） */
const normLabel = (s?: string | null) =>
  (s ?? '').replace(/\r?\n/g, '').replace(/[ \t\u3000]+/g, '').trim();

/** doc_groupの取り出し（単数/配列/カンマ区切りを許容） */
const extractKeysFromRow = (r: DocMasterRow): ServiceKey[] => {
  const raw = (r.service_key ?? r.doc_group) as unknown;
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean) as ServiceKey[];
  }
  const s = String(raw).trim();
  if (!s) return [];
  // カンマ / 日本語読点 / パイプ を区切りとして許容（空白はそのまま）
  return s
    .split(/[,\u3001|]+/)
    .map((v) => v.trim())
    .filter(Boolean) as ServiceKey[];
};

/** マスタ（certificateのみ&有効）を抽出 */
const activeCertRows = (rows: DocMasterRow[]) =>
  (rows ?? []).filter((r) => r?.category === 'certificate' && r?.is_active !== false);

/**
 * 保有資格(attachments) と マスタ から
 * 提供可能サービスキー(doc_group)の一意配列を返す
 */
export function determineServicesFromCertificates(
  certDocs: DocItemLite[],
  masterRows: DocMasterRow[],
): ServiceKey[] {
  const certMaster = activeCertRows(masterRows);

  // 正規化ラベル -> ServiceKey[]（1資格が複数サービスを持つ将来にも対応）
  const labelToKeys = new Map<string, ServiceKey[]>();
  for (const r of certMaster) {
    const label = normLabel(r.label);
    const keys = extractKeysFromRow(r);
    if (label && keys.length) {
      labelToKeys.set(label, keys);
    }
  }

  // 提出済みラベルからサービスキー集合を合成（順序は初出順を維持）
  const found = new Set<ServiceKey>();
  for (const d of certDocs ?? []) {
    const keys = labelToKeys.get(normLabel(d?.label)) ?? [];
    for (const k of keys) found.add(k);
  }
  return Array.from(found);
}

/**
 * マスタに登録された「可能なサービス(doc_group)」を
 * 重複なく一意配列で返す（画面の「可能なサービス」表示用）
 */
export function listAllServiceKeys(masterRows: DocMasterRow[]): ServiceKey[] {
  const keys = new Set<ServiceKey>();
  for (const r of activeCertRows(masterRows)) {
    for (const k of extractKeysFromRow(r)) keys.add(k);
  }
  return Array.from(keys);
}

/** デバッグ用（任意） */
export function _debugLabelMap(masterRows: DocMasterRow[]) {
  return activeCertRows(masterRows).map((r) => ({
    label_norm: normLabel(r.label),
    keys: extractKeysFromRow(r),
  }));
}

// ==== ここから追加（既存の export の下あたりに追記） =====================

export type EligibilityResult = {
  /** true: 条件を満たす / false: 満たさない / null: 判定不能（要件未定義など） */
  ok: boolean | null;
  reasons: string[];
  /** このサービスで要求される ServiceKey 一覧 */
  requiredKeys: ServiceKey[];
  /** ユーザーが保有している ServiceKey 一覧 */
  userKeys: ServiceKey[];
};

/**
 * サービスコード／require_doc_group から必要な ServiceKey を返す
 *
 * - requireDocGroup があればそれを最優先で 1:1 対応させる
 * - serviceCode のみの場合は、コードごとの対応表で決定
 * - 対応表に無いコードは空配列（＝現在は資格チェック対象外）
 */
export function requiredServiceKeysForService(
  serviceCode: string | null,
  requireDocGroup?: string | null,
): ServiceKey[] {
  // require_doc_group 優先（ShiftCard の考え方と揃える）
  if (requireDocGroup && requireDocGroup.trim().length > 0) {
    return [requireDocGroup.trim() as ServiceKey];
  }

  const code = (serviceCode ?? "").trim();
  if (!code) return [];

  // サービスコード → ServiceKey 対応表
  // 必要に応じて随時拡張してください
  switch (code) {
    case "行動援護":
      // 行動援護 ＝ 移動支援系の資格が必要、という想定
      return ["mobility"];
    case "移動支援":
      return ["mobility"];

    // 例: 身体介護を home_help で扱いたい場合
    // case "身体１・Ⅱ":
    //   return ["home_help"];

    default:
      // 未定義のサービスコードは、いまのところ「資格チェック対象外」
      return [];
  }
}

/**
 * 「ユーザー（保有資格Doc） + サービス情報」で入れるかどうかを判定する
 *
 * - certDocs: ユーザーの資格証明書（DocItemLite[]）
 * - masterRows: user_doc_master 由来のマスタ（DocMasterRow[]）
 * - serviceCode: shift.service_code 等
 * - requireDocGroup: サービス定義側で持っている require_doc_group（あればこちら優先）
 */
export function judgeUserCertificatesForService(
  certDocs: DocItemLite[],
  masterRows: DocMasterRow[],
  serviceCode: string | null,
  requireDocGroup?: string | null,
): EligibilityResult {
  const userKeys = determineServicesFromCertificates(certDocs, masterRows);
  const requiredKeys = requiredServiceKeysForService(serviceCode, requireDocGroup);

  // 必要資格が定義されていない場合 → 判定不能（アラート対象外にしたいケース）
  if (requiredKeys.length === 0) {
    return {
      ok: null,
      reasons: ["このサービスに対する必要資格キーが未定義です"],
      requiredKeys,
      userKeys,
    };
  }

  // ユーザー側に有効な資格が 1 つも無い場合
  if (userKeys.length === 0) {
    return {
      ok: false,
      reasons: ["ユーザーに有効な資格が登録されていません"],
      requiredKeys,
      userKeys,
    };
  }

  const hasRequired = requiredKeys.some((rk) => userKeys.includes(rk));

  return {
    ok: hasRequired,
    reasons: hasRequired
      ? []
      : ["必要な資格キーを1つも保有していません"],
    requiredKeys,
    userKeys,
  };
}
// ==== 追加ここまで =========================================================
