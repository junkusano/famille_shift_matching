// =============================================================
// src/lib/cm/contracts/templates.ts
// 契約書テンプレート定義
//
// DBテーブルは作らず、コード内で固定定義
// テンプレート追加時はこのファイルを更新
// =============================================================

import type {
  CmDocumentTemplate,
} from '@/types/cm/contractCreate';
import type { CmContractTemplateCode } from '@/types/cm/contractTemplate';

// =============================================================
// テンプレート定義
// =============================================================

/**
 * 契約書テンプレート一覧
 */
export const CONTRACT_DOCUMENT_TEMPLATES: CmDocumentTemplate[] = [
  {
    code: 'care-contract',
    name: 'ケアマネジメント契約書',
    isRequired: true,
    sortOrder: 1,
    signers: ['signer'],  // 利用者のみ（事業者印は別途）
  },
  {
    code: 'important-info',
    name: '重要事項説明書',
    isRequired: true,
    sortOrder: 2,
    signers: ['signer'],
  },
  {
    code: 'privacy-consent',
    name: '個人情報使用同意書',
    isRequired: true,
    sortOrder: 3,
    signers: ['signer'],
  },
  {
    code: 'fee-table',
    name: '利用料金表',
    isRequired: false,
    sortOrder: 4,
    signers: ['signer'],
  },
];

/**
 * テンプレートコードからテンプレートを取得
 */
export function getTemplateByCode(
  code: CmContractTemplateCode
): CmDocumentTemplate | undefined {
  return CONTRACT_DOCUMENT_TEMPLATES.find((t) => t.code === code);
}

/**
 * 必須テンプレートのコード一覧を取得
 */
export function getRequiredTemplateCodes(): CmContractTemplateCode[] {
  return CONTRACT_DOCUMENT_TEMPLATES
    .filter((t) => t.isRequired)
    .map((t) => t.code);
}

/**
 * テンプレートをソート順で取得
 */
export function getTemplatesSorted(): CmDocumentTemplate[] {
  return [...CONTRACT_DOCUMENT_TEMPLATES].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}