// /lib/certificateJudge.ts

export type ServiceKey =
  | 'home_help'
  | 'heavy_help'
  | 'mobility'
  | 'care_manager'
  | 'disability_home'
  | 'other'
  | (string); // 一旦ゆるめて任意文字列も許容（doc_group が日本語でも動く）

export type DocMasterRow = {
  category: string;
  label: string | null;
  // supabase で select('..., service_key:doc_group') と alias 取得推奨
  service_key?: string | null;
  // 念のため素の列名も受けられるように
  doc_group?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
};

export type DocItemLite = { label?: string | null; type?: string | null };

/** ラベルの正規化（改行・半角/全角空白の除去 + trim） */
const norm = (s?: string | null) =>
  (s ?? '').replace(/\r?\n/g, '').replace(/[ \t\u3000]+/g, '').trim();

/** マスタ行からサービスキーを取り出す（service_key優先→doc_group） */
const pickKey = (r: DocMasterRow): string | null =>
  (r.service_key ?? r.doc_group ?? null);

/**
 * 保有資格(attachments) と マスタ から 提供可能サービスキー一覧を返す
 */
export function determineServicesFromCertificates(
  certDocs: DocItemLite[],
  masterRows: DocMasterRow[],
): ServiceKey[] {
  // 有効な certificate マスタのみ
  const certMaster = (masterRows ?? []).filter(
    (r) => r?.category === 'certificate' && r?.is_active !== false
  );

  // label(正規化) -> service_key/doc_group
  const labelToKey = new Map<string, ServiceKey>();
  for (const r of certMaster) {
    const label = norm(r.label);
    const key = pickKey(r);
    if (label && key) {
      labelToKey.set(label, key as ServiceKey);
    }
  }

  // ユーザー提出済み資格の label(正規化) からサービスを集計
  const found = new Set<ServiceKey>();
  for (const d of certDocs ?? []) {
    const label = norm(d?.label);
    if (!label) continue;
    const key = labelToKey.get(label);
    if (key) found.add(key);
  }

  return Array.from(found);
}

/** デバッグ用: マスタの「正規化ラベル→キー」対応を一覧で確認 */
export function _debugLabelMap(masterRows: DocMasterRow[]) {
  const certMaster = (masterRows ?? []).filter(
    (r) => r?.category === 'certificate' && r?.is_active !== false
  );
  return certMaster.map((r) => ({ label: norm(r.label), key: pickKey(r) }));
}
