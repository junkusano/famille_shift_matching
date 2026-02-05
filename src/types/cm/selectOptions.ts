// =============================================================
// src/types/cm/selectOptions.ts
// 選択肢マスタ・自社事業所関連の型定義
// =============================================================

// =============================================================
// 選択肢マスタ
// =============================================================

/**
 * 選択肢カテゴリ
 */
export type CmSelectOptionCategory = 'relationship' | 'proxy_reason';

/**
 * 選択肢マスタ
 * テーブル: cm_select_options
 */
export type CmSelectOption = {
  id: string;
  category: CmSelectOptionCategory;
  code: string;
  label: string;
  requires_input: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

/**
 * 選択肢の値（コード + その他テキスト）
 */
export type CmSelectValue = {
  code: string;
  otherText: string | null;
};

// =============================================================
// 自社事業所
// =============================================================

/**
 * 自社事業所情報
 * テーブル: cm_own_office
 *
 * 変更履歴:
 *   2026-02-05: representative → manager_name にリネーム
 *               corporation_name, representative_name を追加
 */
export type CmOwnOffice = {
  id: string;
  code: string;
  name: string;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  /** 運営法人名（例: 合同会社 施恩） */
  corporation_name: string | null;
  /** 代表者名（例: 草野 淳） */
  representative_name: string | null;
  /** 管理者名（例: 増田 志乃）- 旧 representative */
  manager_name: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

// =============================================================
// 署名者・後見人
// =============================================================

/**
 * 署名者区分
 */
export type CmSignerType = 'self' | 'proxy';

/**
 * 後見人種別
 */
export type CmGuardianType = 'legal' | 'curator' | 'assistant';

/**
 * 後見人種別の表示ラベル
 */
export const CM_GUARDIAN_TYPE_LABELS: Record<CmGuardianType, string> = {
  legal: '成年後見人',
  curator: '保佐人',
  assistant: '補助人',
};

/**
 * 後見人情報
 */
export type CmGuardianInfo = {
  hasGuardian: boolean;
  guardianType: CmGuardianType | null;
  guardianConfirmed: boolean;
  guardianDocumentChecked: boolean;
  guardianNotes: string;
};

// =============================================================
// ヘルパー関数
// =============================================================

/**
 * 選択肢の表示値を取得
 * 「その他」の場合は「その他（具体的内容）」形式で返す
 */
export function getSelectDisplayValue(
  code: string,
  otherText: string | null | undefined,
  options: CmSelectOption[]
): string {
  const option = options.find((o) => o.code === code);
  if (!option) return code || '';

  if (option.requires_input && otherText) {
    return `${option.label}（${otherText}）`;
  }
  return option.label;
}

/**
 * 選択肢が「その他」かどうかを判定
 */
export function isOtherOption(code: string, options: CmSelectOption[]): boolean {
  const option = options.find((o) => o.code === code);
  return option?.requires_input ?? false;
}