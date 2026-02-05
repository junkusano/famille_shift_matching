// =============================================================
// src/types/cm/contractTemplate.ts
// 契約書テンプレート 型定義 & タグマスタ
// =============================================================

/**
 * テンプレートコード
 */
export type CmContractTemplateCode =
  | 'care-contract'
  | 'important-info'
  | 'privacy-consent'
  | 'fee-table';

/**
 * テンプレート（DB）
 */
export type CmContractTemplate = {
  id: string;
  code: CmContractTemplateCode;
  name: string;
  html_content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_name?: string | null;
};

/**
 * テンプレート一覧表示用
 */
export type CmContractTemplateListItem = {
  id: string;
  code: CmContractTemplateCode;
  name: string;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
  updated_by_name?: string | null;
};

// =============================================================
// タグマスタ定義（一元管理）
// =============================================================

/**
 * タグカテゴリ
 */
export type CmTagCategory = 'client' | 'family' | 'proxy' | 'contract' | 'staff' | 'office';

/**
 * タグ定義
 */
export type CmContractTagDefinition = {
  tag: string;
  label: string;
  category: CmTagCategory;
  source: 'auto' | 'input';
  sourceField?: string;
  inputType?: 'text' | 'date' | 'select' | 'textarea';
  required?: boolean;
  selectOptions?: 'staff'; // select時の選択肢
};

/**
 * カテゴリラベル
 */
export const CM_TAG_CATEGORY_LABELS: Record<CmTagCategory, string> = {
  client: '利用者情報',
  family: '家族情報',
  proxy: '代筆者情報',
  contract: '契約情報',
  staff: '担当者情報',
  office: '事業所情報',
};

/**
 * 差し込みタグマスタ（一元管理）
 *
 * source:
 *   - 'auto': DBや選択済みデータから自動取得
 *   - 'input': ステップ2で入力
 */
export const CM_CONTRACT_TAGS: CmContractTagDefinition[] = [
  // =============================================================
  // 利用者情報（自動取得）
  // =============================================================
  { tag: '{{利用者氏名}}', label: '利用者氏名', category: 'client', source: 'auto', sourceField: 'client.name' },
  { tag: '{{利用者住所}}', label: '利用者住所', category: 'client', source: 'auto', sourceField: 'client.address' },
  { tag: '{{利用者電話}}', label: '利用者電話', category: 'client', source: 'auto', sourceField: 'client.phone' },
  { tag: '{{利用者FAX}}', label: '利用者FAX', category: 'client', source: 'auto', sourceField: 'client.fax' },

  // =============================================================
  // 家族情報（自動取得）
  // =============================================================
  { tag: '{{家族氏名}}', label: '家族氏名', category: 'family', source: 'auto', sourceField: 'family.name' },
  { tag: '{{家族続柄}}', label: '家族続柄', category: 'family', source: 'auto', sourceField: 'family.relation' },

  // =============================================================
  // 代筆者情報（ステップ2で入力）
  // =============================================================
  { tag: '{{代筆者氏名}}', label: '代筆者氏名', category: 'proxy', source: 'input', inputType: 'text' },
  { tag: '{{代筆者続柄}}', label: '代筆者続柄', category: 'proxy', source: 'input', inputType: 'text' },
  { tag: '{{代筆理由}}', label: '代筆理由', category: 'proxy', source: 'input', inputType: 'text' },
  { tag: '{{代筆者住所}}', label: '代筆者住所', category: 'proxy', source: 'input', inputType: 'text' },
  { tag: '{{代筆者電話}}', label: '代筆者電話', category: 'proxy', source: 'input', inputType: 'text' },
  { tag: '{{代筆者FAX}}', label: '代筆者FAX', category: 'proxy', source: 'input', inputType: 'text' },
  { tag: '{{緊急連絡先電話}}', label: '緊急連絡先電話', category: 'proxy', source: 'input', inputType: 'text' },

  // =============================================================
  // 契約情報（ステップ2で入力）
  // =============================================================
  { tag: '{{契約日}}', label: '契約日', category: 'contract', source: 'input', inputType: 'date', required: true },
  { tag: '{{契約開始日}}', label: '契約開始日', category: 'contract', source: 'input', inputType: 'date' },
  { tag: '{{契約終了日}}', label: '契約終了日', category: 'contract', source: 'input', inputType: 'date' },

  // =============================================================
  // 担当者情報（選択 + 自動取得）
  // =============================================================
  { tag: '{{説明者氏名}}', label: '説明者', category: 'staff', source: 'input', inputType: 'select', selectOptions: 'staff', required: true },
  { tag: '{{担当者1氏名}}', label: '担当ケアマネ', category: 'staff', source: 'input', inputType: 'select', selectOptions: 'staff' },
  { tag: '{{担当者1電話}}', label: '担当ケアマネ電話', category: 'staff', source: 'auto', sourceField: 'careManager.phone' },
  { tag: '{{担当者1期間}}', label: '担当期間', category: 'staff', source: 'input', inputType: 'text' },

  // =============================================================
  // 事業所情報（固定・自動取得）
  // =============================================================
  { tag: '{{事業所名}}', label: '事業所名', category: 'office', source: 'auto', sourceField: 'office.name' },
  { tag: '{{事業所住所}}', label: '事業所住所', category: 'office', source: 'auto', sourceField: 'office.address' },
  { tag: '{{事業所電話}}', label: '事業所電話', category: 'office', source: 'auto', sourceField: 'office.phone' },
  { tag: '{{代表者名}}', label: '代表者名', category: 'office', source: 'auto', sourceField: 'office.representative' },
];

// =============================================================
// DigiSignerタグ
// =============================================================

export type CmDigiSignerTag = {
  tag: string;
  label: string;
  role: string;
};

export const CM_DIGISIGNER_TAGS: CmDigiSignerTag[] = [
  // 利用者
  { tag: '[s:signer                    ]', label: '署名欄（利用者）', role: 'signer' },
  { tag: '[d:signer          ]', label: '日付欄（利用者）', role: 'signer' },
  { tag: '[c:signer]', label: 'チェック欄（利用者）', role: 'signer' },
  // 代筆者
  { tag: '[s:proxy_signer                    ]', label: '署名欄（代筆者）', role: 'proxy_signer' },
  { tag: '[d:proxy_signer          ]', label: '日付欄（代筆者）', role: 'proxy_signer' },
  // 家族
  { tag: '[s:family                    ]', label: '署名欄（家族）', role: 'family' },
  { tag: '[d:family          ]', label: '日付欄（家族）', role: 'family' },
  // ケアマネ
  { tag: '[s:care_manager_1                    ]', label: '署名欄（ケアマネ）', role: 'care_manager_1' },
  { tag: '[d:care_manager_1          ]', label: '日付欄（ケアマネ）', role: 'care_manager_1' },
];

// =============================================================
// ヘルパー関数
// =============================================================

/**
 * 入力が必要なタグのみ取得
 */
export function getInputTags(): CmContractTagDefinition[] {
  return CM_CONTRACT_TAGS.filter((t) => t.source === 'input');
}

/**
 * カテゴリ別にタグをグループ化
 */
export function getTagsByCategory(): Record<CmTagCategory, CmContractTagDefinition[]> {
  const result: Record<CmTagCategory, CmContractTagDefinition[]> = {
    client: [],
    family: [],
    proxy: [],
    contract: [],
    staff: [],
    office: [],
  };
  for (const tag of CM_CONTRACT_TAGS) {
    result[tag.category].push(tag);
  }
  return result;
}

/**
 * タグキーを抽出（{{利用者氏名}} → 利用者氏名）
 */
export function extractTagKey(tag: string): string {
  return tag.replace(/^\{\{|\}\}$/g, '');
}