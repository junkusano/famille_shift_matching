// =============================================================
// src/types/cm/clientDetail.ts
// CM利用者詳細関連の型定義
// =============================================================

/**
 * 居宅介護支援事業所情報
 */
export type CmSupportOffice = {
  id: string;
  kaipoke_insurance_id: string;
  apply_start: string;
  office_name: string | null;
  contract_type: string | null;
  care_manager_id: string | null;
  care_manager_kaipoke_id: string | null;
  care_manager_name: string | null;
  support_center_name: string | null;
  notification_date: string | null;
};

/**
 * 給付制限情報
 */
export type CmBenefitLimit = {
  id: string;
  kaipoke_insurance_id: string;
  limit_start: string;
  limit_end: string | null;
  benefit_rate: number;
};

/**
 * 被保険者証情報（詳細）
 */
export type CmInsuranceDetail = {
  id: string;
  kaipoke_cs_id: string;
  kaipoke_insurance_id: string;
  coverage_start: string;
  coverage_end: string;
  insurer_code: string;
  insurer_name: string | null;
  cert_status: string | null;
  insured_number: string;
  issue_date: string | null;
  certification_date: string | null;
  cert_valid_start: string | null;
  cert_valid_end: string | null;
  care_level: string | null;
  limit_units: number | null;
  supportOffices: CmSupportOffice[];
  benefitLimits: CmBenefitLimit[];
};

/**
 * 書類情報
 */
export type CmDocument = {
  id: string;
  url: string | null;
  label?: string;
  type?: string;
  mimeType?: string | null;
  uploaded_at?: string;
  acquired_at?: string;
};

/**
 * 利用者詳細情報
 */
export type CmClientDetail = {
  id: string;
  kaipoke_cs_id: string;
  name: string;
  kana: string | null;
  gender: string | null;
  birth_date: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  town: string | null;
  building: string | null;
  phone_01: string | null;
  phone_02: string | null;
  client_status: string | null;
  contract_date: string | null;
  biko: string | null;
  is_active: boolean;
  documents: CmDocument[] | null;
  insurances: CmInsuranceDetail[];
};

/**
 * 利用者詳細APIレスポンス
 */
export type CmClientDetailApiResponse = {
  ok: boolean;
  client?: CmClientDetail;
  error?: string;
};

/**
 * タブID
 */
export const CM_TABS = [
  { id: 'basic', label: '基本情報', icon: 'User' },
  { id: 'insurance', label: '被保険者証情報', icon: 'Shield' },
  { id: 'calculation', label: '算定情報', icon: 'Calculator', disabled: true },
  { id: 'public', label: '公費情報', icon: 'Wallet', disabled: true },
  { id: 'reduction', label: '減額認定情報', icon: 'Percent', disabled: true },
  { id: 'address', label: '住所地特例情報', icon: 'MapPin', disabled: true },
  { id: 'life', label: 'LIFE設定', icon: 'Heart', disabled: true },
  { id: 'documents', label: '書類管理', icon: 'FolderOpen' },
  { id: 'contracts', label: '契約', icon: 'FileSignature' },
] as const;

export type CmTabId = typeof CM_TABS[number]['id'];