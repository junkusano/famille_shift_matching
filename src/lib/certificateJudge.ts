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
