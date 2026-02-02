// =============================================================
// src/types/cm/contract.ts
// 電子契約システム 型定義
// =============================================================

/**
 * 契約ステータス
 */
export type CmContractStatus = 'draft' | 'signing' | 'signed' | 'completed';

/**
 * 契約方式
 */
export type CmSigningMethod = 'electronic' | 'paper';

/**
 * 契約種別
 */
export type CmContractType = 'new_admission' | 'renewal' | 'addition';

/**
 * 書類署名ステータス
 */
export type CmDocumentSigningStatus = 'pending' | 'sent' | 'signed' | 'declined';

/**
 * 署名者種別
 */
export type CmSignerType = 'self' | 'proxy';

/**
 * 契約（一覧表示用）
 */
export type CmContractListItem = {
  id: string;
  kaipoke_cs_id: string;
  contract_type: CmContractType;
  signing_method: CmSigningMethod;
  status: CmContractStatus;
  contract_date: string | null;
  staff_id: string;
  staff_name: string | null;
  consent_record_id: string | null;
  verification_method_id: string | null;
  verification_method_name: string | null;
  verification_document_id: string | null;
  verification_document_name: string | null;
  plaud_recording_id: number | null;
  signed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
};

/**
 * 電子契約同意レコード
 */
export type CmContractConsent = {
  id: string;
  kaipoke_cs_id: string;
  consent_electronic: boolean;
  consent_recording: boolean;
  signer_type: CmSignerType;
  proxy_name: string | null;
  proxy_relationship: string | null;
  proxy_reason: string | null;
  gdrive_file_id: string | null;
  gdrive_file_url: string | null;
  gdrive_file_path: string | null;
  consented_at: string;
  staff_id: string;
  staff_name: string | null;
};

/**
 * 利用者別契約データ（タブ表示用）
 */
export type CmClientContractsData = {
  consent: CmContractConsent | null;
  contracts: CmContractListItem[];
};

/**
 * 契約書類
 */
export type CmContractDocument = {
  id: string;
  contract_id: string;
  document_type: string;
  document_name: string;
  digisigner_document_id: string | null;
  digisigner_signature_request_id: string | null;
  signing_url: string | null;
  signing_status: CmDocumentSigningStatus;
  signed_at: string | null;
  gdrive_file_id: string | null;
  gdrive_file_url: string | null;
  gdrive_file_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * 契約詳細データ
 */
export type CmContractDetailData = {
  contract: CmContractListItem & {
    client_name: string | null;
    client_kana: string | null;
    verification_at: string | null;
    verification_document_other: string | null;
    notes: string | null;
  };
  documents: CmContractDocument[];
  consent: CmContractConsent | null;
  plaudRecording: {
    id: number;
    plaud_uuid: string;
    title: string;
    plaud_created_at: string;
    status: string;
  } | null;
};

/**
 * 本人確認方法マスタ
 */
export type CmVerificationMethod = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

/**
 * 本人確認書類マスタ
 */
export type CmVerificationDocument = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

/**
 * ステータス表示ラベル
 */
export const CM_CONTRACT_STATUS_LABELS: Record<CmContractStatus, string> = {
  draft: '下書き',
  signing: '署名待ち',
  signed: '署名済み',
  completed: '完了',
};

/**
 * ステータス表示色（Tailwind クラス名）
 */
export const CM_CONTRACT_STATUS_COLORS: Record<CmContractStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600' },
  signing: { bg: 'bg-amber-100', text: 'text-amber-700' },
  signed: { bg: 'bg-green-100', text: 'text-green-700' },
  completed: { bg: 'bg-blue-100', text: 'text-blue-700' },
};

/**
 * 契約種別表示ラベル
 */
export const CM_CONTRACT_TYPE_LABELS: Record<CmContractType, string> = {
  new_admission: '新規',
  renewal: '更新',
  addition: '追加',
};
