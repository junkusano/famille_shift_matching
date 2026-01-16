// =============================================================
// src/types/cm/faxDetail.ts
// FAX詳細画面関連の型定義
//
// 【v3.2対応】
// - CmPageSuggestion を新旧両形式に対応
// =============================================================

/**
 * FAX受信情報
 */
export type CmFaxReceived = {
  id: number;
  fax_number: string;
  sender_name: string | null;
  received_at: string;
  page_count: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  pdf_drive_file_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * FAXページ情報
 */
export type CmFaxPage = {
  id: number;
  fax_received_id: number;
  page_number: number;
  image_url: string | null;
  image_drive_file_id: string | null;
  rotation: number;
  logical_order: number | null;
  ocr_status: 'pending' | 'processing' | 'completed' | 'error' | null;
  ocr_text: string | null;
  suggested_client_id: string | null;
  suggested_client_name: string | null;
  suggested_doc_type_id: number | null;
  suggested_confidence: number | null;
  suggested_reason: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 書類情報
 */
export type CmFaxDocument = {
  id: number;
  fax_received_id: number;
  document_type_id: number | null;
  document_type_name: string | null;
  office_id: number | null;
  office_name: string | null;
  is_advertisement: boolean;
  is_cover_sheet: boolean;
  requires_response: boolean;
  response_deadline: string | null;
  response_sent_at: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
  client_ids: string[] | null;
  client_names: string[] | null;
  page_ids: number[] | null;
  page_numbers: number[] | null;
};

/**
 * FAX-事業所紐付け
 */
export type CmFaxReceivedOffice = {
  id: number;
  fax_received_id: number;
  office_id: number;
  office_name: string;
  fax: string | null;
  fax_proxy: string | null;
  service_type: string | null;
  is_primary: boolean;
  assigned_by: string | null;
  assigned_at: string | null;
};

/**
 * 利用者候補
 */
export type CmClientCandidate = {
  kaipoke_cs_id: string;
  client_name: string;
  client_kana: string;
  office_id: number;
  office_name: string;
};

/**
 * 文書種別
 */
export type CmDocumentType = {
  id: number;
  name: string;
  category: string | null;
  sort_order: number;
};

/**
 * 事業所検索結果
 */
export type CmOfficeSearchResult = {
  id: number;
  office_name: string;
  fax: string | null;
  fax_proxy: string | null;
  service_type: string | null;
  prefecture: string | null;
};

/**
 * ページごとのAI推定（v3.2拡張版）
 * 
 * 新形式（clients配列、docTypeオブジェクト）と
 * 旧形式（clientId/clientName/docTypeId）の両方に対応
 */
export type CmPageSuggestion = {
  // 新形式（配列・オブジェクト）
  clients?: Array<{
    kaipoke_cs_id: string;
    client_name: string;
    confidence: number;
  }>;
  docType?: {
    id: number;
    name: string;
    confidence: number;
  } | null;

  // 旧形式（単一値）- 後方互換
  clientId?: string | null;
  clientName?: string | null;
  docTypeId?: number | null;
  confidence?: number | null;

  // 共通
  reason?: string | null;
  is_advertisement?: boolean;
};

/**
 * 処理状況
 */
export type CmProcessingStatus = {
  total_pages: number;
  assigned_pages: number;
  total_documents: number;
  completion_rate: number;
};

/**
 * 選択中の利用者
 */
export type CmSelectedClient = {
  kaipokeCSId: string;
  name: string;
  officeId: number;
  isPrimary: boolean;
};

/**
 * トースト状態
 */
export type CmToastState = {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
};

/**
 * タブID
 */
export type CmFaxDetailTabId = 'assign' | 'documents';

/**
 * FAX詳細APIレスポンス
 */
export type CmFaxDetailApiResponse = {
  ok: boolean;
  fax?: CmFaxReceived;
  pages?: CmFaxPage[];
  offices?: CmFaxReceivedOffice[];
  documents?: CmFaxDocument[];
  clients?: CmClientCandidate[];
  documentTypes?: CmDocumentType[];
  processingStatus?: CmProcessingStatus;
  error?: string;
};

/**
 * 書類保存APIレスポンス
 */
export type CmSaveDocumentApiResponse = {
  ok: boolean;
  document_id?: number;
  error?: string;
};

/**
 * 事業所追加APIレスポンス
 */
export type CmAddOfficeApiResponse = {
  ok: boolean;
  fax_received_id?: number;
  office_id?: number;
  is_primary?: boolean;
  fax_proxy_registered?: boolean;
  error?: string;
};