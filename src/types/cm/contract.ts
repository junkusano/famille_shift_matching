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
 *
 * v2変更: 'sent' → 'signing' にリネーム（cm_contracts.status と用語統一）
 *   pending  - 署名待ち（DigiSigner未送信 or 紙契約未着手）
 *   signing  - 署名中（DigiSigner送信済み）
 *   signed   - 署名完了
 *   declined - 辞退（DigiSignerの署名拒否イベント用）
 */
export type CmDocumentSigningStatus = 'pending' | 'signing' | 'signed' | 'declined';

/**
 * 署名者種別
 *
 * v2変更: 'proxy' → 'scribe'（代筆）/ 'agent'（代理人）に分割
 *   self   - 本人
 *   scribe - 代筆（本人の意思あり、身体的理由で代筆者が署名）
 *   agent  - 代理人（本人に代わり代理人が契約行為を行う）
 */
export type CmSignerType = 'self' | 'scribe' | 'agent';

/**
 * 署名者ロール（DigiSigner Text Tags / cm_contract_document_signers.role）
 */
export type CmSignerRole = 'signer' | 'scribe' | 'agent' | 'family' | 'care_manager_1';

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
 *
 * v2変更: proxy_* → scribe_*agent_*guardian_*
 */
export type CmContractConsent = {
  id: string;
  kaipoke_cs_id: string;
  consent_electronic: boolean;
  consent_recording: boolean;
  signer_type: CmSignerType;

  // 代筆者情報（signer_type === 'scribe' の場合）
  scribe_name: string | null;
  scribe_relationship_code: string | null;
  scribe_relationship_other: string | null;
  scribe_reason_code: string | null;
  scribe_reason_other: string | null;

  // 代理人情報（signer_type === 'agent' の場合）
  agent_name: string | null;
  agent_relationship_code: string | null;
  agent_relationship_other: string | null;
  agent_authority: string | null;

  // 後見人確認
  guardian_type: string | null;
  guardian_confirmed: boolean;
  guardian_notes: string | null;

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
 * 署名者レコード（cm_contract_document_signers テーブル）
 *
 * v2新規: 電子契約で1書類に対する複数署名者を管理
 */
export type CmContractDocumentSigner = {
  id: string;
  document_id: string;
  role: CmSignerRole;
  signer_name: string | null;
  signer_email: string | null;
  signing_url: string | null;
  signing_status: CmDocumentSigningStatus;
  signed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * 契約書類
 *
 * v2変更:
 *   - signing_url, signed_at → 子テーブル cm_contract_document_signers に移行
 *   - all_signed_at 追加（全署名者完了日時）
 *   - 紙契約用カラム追加（unsigned_gdrive_*, signed_gdrive_*, signed_uploaded_at）
 *   - signers（子テーブルJOIN結果）追加
 */
export type CmContractDocument = {
  id: string;
  contract_id: string;
  document_type: string;
  document_name: string;
  digisigner_document_id: string | null;
  digisigner_signature_request_id: string | null;
  signing_status: CmDocumentSigningStatus;
  all_signed_at: string | null;

  // 紙契約用: 未署名PDF（印刷用）
  unsigned_gdrive_file_id: string | null;
  unsigned_gdrive_file_url: string | null;

  // 紙契約用: 署名済みPDF（スキャン/撮影アップロード）
  signed_gdrive_file_id: string | null;
  signed_gdrive_file_url: string | null;
  signed_uploaded_at: string | null;

  // 電子契約: 署名完了後のPDF保存先
  gdrive_file_id: string | null;
  gdrive_file_url: string | null;
  gdrive_file_path: string | null;

  sort_order: number;
  created_at: string;
  updated_at: string;

  // 子テーブル（getContractDetail 等でJOIN）
  signers?: CmContractDocumentSigner[];
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

/**
 * 書類署名ステータス表示ラベル
 */
export const CM_DOCUMENT_SIGNING_STATUS_LABELS: Record<CmDocumentSigningStatus, string> = {
  pending: '未送信',
  signing: '署名中',
  signed: '署名済',
  declined: '辞退',
};

/**
 * 書類署名ステータス表示色（Tailwind クラス名）
 */
export const CM_DOCUMENT_SIGNING_STATUS_COLORS: Record<CmDocumentSigningStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-slate-100', text: 'text-slate-600' },
  signing: { bg: 'bg-amber-100', text: 'text-amber-700' },
  signed: { bg: 'bg-green-100', text: 'text-green-700' },
  declined: { bg: 'bg-red-100', text: 'text-red-700' },
};

/**
 * 署名者種別表示ラベル
 */
export const CM_SIGNER_TYPE_LABELS: Record<CmSignerType, string> = {
  self: '本人',
  scribe: '代筆',
  agent: '代理人',
};