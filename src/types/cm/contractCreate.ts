// =============================================================
// src/types/cm/contractCreate.ts
// 契約書作成ウィザード用 型定義
// =============================================================

import type { CmContractTemplateCode } from './contractTemplate';

/**
 * 書類テンプレートコード
 * DBテンプレート4種 + 結合PDF用の 'combined'
 */
export type CmDocumentTemplateCode = CmContractTemplateCode | 'combined';

/**
 * 書類テンプレート定義
 */
export type CmDocumentTemplate = {
  code: CmContractTemplateCode;
  name: string;
  isRequired: boolean;
  sortOrder: number;
  signers: string[];  // DigiSigner署名者ロール
};

/**
 * 契約作成用 利用者情報
 */
export type CmClientInfoForContract = {
  kaipokeCsId: string;
  name: string;
  nameKana: string | null;
  postalCode: string | null;
  address: string;           // 都道府県+市区町村+町名+建物名を結合
  phone: string | null;
  birthDate: string | null;
  careLevel: string | null;  // 最新の介護度
};

/**
 * 契約作成ウィザード Step1 データ（書類選択）
 */
export type CmContractCreateStep1Data = {
  selectedTemplates: CmContractTemplateCode[];
};

/**
 * 契約作成ウィザード Step2 データ（情報確認）
 *
 * v2変更: proxy_* → scribe_*agent_* に分割（署名者3分類対応）
 */
export type CmContractCreateStep2Data = {
  // ========== 利用者情報 ==========
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  clientFax: string;

  // ========== 署名者区分 ==========
  signerType: 'self' | 'scribe' | 'agent';

  // ========== 代筆者情報（signerType === 'scribe' の場合） ==========
  scribeName: string;
  scribeRelationshipCode: string;       // マスタのcode
  scribeRelationshipOther: string;      // 「その他」の場合の具体的内容
  scribeReasonCode: string;             // マスタのcode
  scribeReasonOther: string;            // 「その他」の場合の具体的内容
  scribeAddress: string;
  scribePhone: string;

  // ========== 代理人情報（signerType === 'agent' の場合） ==========
  agentName: string;
  agentRelationshipCode: string;        // マスタのcode
  agentRelationshipOther: string;       // 「その他」の場合の具体的内容
  agentAuthority: string;               // 代理の根拠
  agentAddress: string;
  agentPhone: string;

  // ========== 緊急連絡先 ==========
  emergencyPhone: string;

  // ========== 後見人確認（任意） ==========
  hasGuardian: boolean;
  guardianType: 'legal' | 'curator' | 'assistant' | '';  // 成年後見人/保佐人/補助人
  guardianConfirmed: boolean;          // 後見人であることを確認した
  guardianDocumentChecked: boolean;    // 登記事項証明書等を確認した
  guardianNotes: string;               // 備考

  // ========== 契約日程 ==========
  contractDate: string;        // YYYY-MM-DD 形式
  contractStartDate: string;   // YYYY-MM-DD 形式
  contractEndDate: string;     // YYYY-MM-DD 形式

  // ========== 担当者情報 ==========
  staffId: string;             // 説明者ID
  staffName: string;           // 説明者名（表示用）
  careManagerId: string;       // 担当ケアマネID
  careManagerName: string;     // 担当ケアマネ名（表示用）
  careManagerPhone: string;    // 担当ケアマネ電話
  careManagerPeriod: string;   // 担当期間（テキスト）
};

/**
 * 契約作成ウィザード 全データ
 */
export type CmContractCreateWizardData = {
  step1: CmContractCreateStep1Data;
  step2: CmContractCreateStep2Data;
};

/**
 * PDF生成用データ
 */
export type CmPdfGenerationData = {
  // 利用者情報
  clientName: string;
  clientAddress: string;
  clientPhone: string;

  // 家族・代理人情報
  familyName: string;
  familyRelationship: string;

  // 契約情報
  contractDate: string;      // 表示形式（例: 2026年1月20日）
  staffName: string;

  // 事業所情報（固定）
  officeName: string;
  officeAddress: string;
  officePhone: string;
  officeFax: string;
  officeRepresentative: string;
};

/**
 * DigiSigner署名リクエスト作成結果
 *
 * v2変更: 単一 signingUrl → 署名者別 signers 配列
 */
export type CmDigiSignerResult = {
  documentId: string;
  signatureRequestId: string;
  signers: {
    role: string;
    signingUrl: string;
  }[];
};

/**
 * 契約作成結果
 *
 * v2変更: documents 内の signingUrl → signers 配列
 */
export type CmCreateContractResult = {
  contractId: string;
  documents: {
    documentType: CmDocumentTemplateCode;
    documentName: string;
    digisignerDocumentId: string;
    signers: {
      role: string;
      signingUrl: string;
    }[];
  }[];
};

/**
 * 職員選択オプション
 */
export type CmStaffSelectOption = {
  id: string;
  name: string;
};

/**
 * 契約フォームデータ（DB保存形式）
 * テーブル: cm_contract_form_data
 *
 * v2変更: proxy_* → scribe_*agent_*
 */
export type CmContractFormData = {
  id: string;
  contract_id: string;

  // 利用者情報
  client_name: string | null;
  client_address: string | null;
  client_phone: string | null;
  client_fax: string | null;

  // 署名者区分
  signer_type: 'self' | 'scribe' | 'agent';

  // 代筆者情報
  scribe_name: string | null;
  scribe_relationship_code: string | null;
  scribe_relationship_other: string | null;
  scribe_reason_code: string | null;
  scribe_reason_other: string | null;
  scribe_address: string | null;
  scribe_phone: string | null;

  // 代理人情報
  agent_name: string | null;
  agent_relationship_code: string | null;
  agent_relationship_other: string | null;
  agent_authority: string | null;
  agent_address: string | null;
  agent_phone: string | null;

  emergency_phone: string | null;

  // 後見人確認
  has_guardian: boolean;
  guardian_type: 'legal' | 'curator' | 'assistant' | null;
  guardian_confirmed: boolean;
  guardian_document_checked: boolean;
  guardian_notes: string | null;

  // 契約日程
  contract_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;

  // 担当者
  staff_id: string | null;
  staff_name: string | null;
  care_manager_id: string | null;
  care_manager_name: string | null;
  care_manager_phone: string | null;
  care_manager_period: string | null;

  // メタ情報
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};