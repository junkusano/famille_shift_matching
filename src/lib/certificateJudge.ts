// /lib/certificateJudge.ts
export type ServiceKey =
  | 'home_help'
  | 'heavy_help'
  | 'mobility'
  | 'care_manager'
  | 'disability_home'
  | 'other'; // 必要に応じて拡張

export type DocMasterRow = {
  category: 'certificate' | 'other' | string;
  label: string;
  group?: ServiceKey | null;     // ← 追加
  is_active?: boolean;
  sort_order?: number | null;
};

export type DocItemLite = { label?: string | null; type?: string | null };

export function determineServicesFromCertificates(
  certDocs: DocItemLite[],
  masterRows: DocMasterRow[],
): ServiceKey[] {
  // 有効な certificate マスタのみ
  const certMaster = masterRows.filter(
    (r) => r.category === 'certificate' && r.is_active !== false
  );

  // label → group の辞書
  const labelToGroup = new Map<string, ServiceKey>();
  for (const r of certMaster) {
    if (r.label && r.group) labelToGroup.set(r.label, r.group);
  }

  // ユーザー提出済み資格の label からサービスを集計
  const found = new Set<ServiceKey>();
  for (const d of certDocs) {
    const key = d?.label ? labelToGroup.get(d.label) : undefined;
    if (key) found.add(key);
  }

  return Array.from(found);
}