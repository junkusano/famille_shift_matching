// =============================================================
// src/types/cm/faxDetail.ts
// FAX詳細関連の型定義
// =============================================================

/**
 * FAXページ詳細情報
 */
export type CmFaxPageDetail = {
  id: number;
  fax_received_id: number;
  page_number: number;
  rotation: number;
  rotation_source: string | null;
  image_url: string | null;
  ocr_status: 'pending' | 'completed' | 'failed';
  // 推定情報
  suggested_doc_type_id: number | null;
  suggested_doc_type_name: string | null;
  suggested_is_ad: boolean;
  suggested_confidence: number | null;
  suggested_source: string | null;
  kaipoke_cs_id: string | null;
  suggested_client_name: string | null;
  // 確定情報
  document_type_id: number | null;
  document_type_name: string | null;
  is_advertisement: boolean;
  assigned_client_id: string | null;
  assigned_client_name: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  // OCR結果
  ocr_text: string | null;
  ocr_reason: string | null;
};

/**
 * FAX詳細情報
 */
export type CmFaxDetail = {
  id: number;
  gmail_message_id: string;
  fax_number: string;
  office_id: number | null;
  office_name: string | null;
  office_fax_number: string | null;
  office_fax_proxy: string | null;
  office_assigned_by: string | null;
  office_assigned_at: string | null;
  file_name: string;
  file_path: string;
  file_id: string;
  page_count: number;
  status: string;
  received_at: string;
  processed_at: string | null;
  pages: CmFaxPageDetail[];
};

/**
 * 利用者候補
 */
export type CmFaxClientCandidate = {
  id: string;
  name: string;
  kana: string;
  care_level: string | null;
};

/**
 * 事業所情報
 */
export type CmFaxOffice = {
  id: number;
  office_name: string;
  fax_number: string | null;
  fax_proxy: string | null;
};

/**
 * 文書種別
 */
export type CmDocumentType = {
  id: number;
  name: string;
  category: string;
};

/**
 * ページ保存リクエスト
 */
export type CmFaxPageSaveRequest = {
  page_id: number;
  client_id: string | null;
  document_type_id: number | null;
  is_advertisement: boolean;
  rotation: number;
};

/**
 * 事業所割当リクエスト
 */
export type CmFaxOfficeAssignRequest = {
  office_id: number;
  register_fax_proxy: boolean;
  fax_number: string;
};

/**
 * FAX詳細APIレスポンス
 */
export type CmFaxDetailApiResponse = {
  ok: boolean;
  fax?: CmFaxDetail;
  clientCandidates?: CmFaxClientCandidate[];
  documentTypes?: CmDocumentType[];
  error?: string;
};

/**
 * 事業所検索APIレスポンス
 */
export type CmFaxOfficeSearchResponse = {
  ok: boolean;
  offices?: CmFaxOffice[];
  error?: string;
};

/**
 * ページ振り分け状態
 */
export type CmPageAssignment = {
  clientId: string;
  clientName: string;
  docTypeId: number;
  docTypeName: string;
  isAd: boolean;
  rotation: number;
};

/**
 * AI推定理由
 */
export type CmSuggestionReason = {
  type: 'keyword' | 'ocr_match' | 'ocr_partial' | 'continuation' | 'ad_keyword' | 'pattern' | 'unknown';
  detail: string;
  secondary?: string;
};

/**
 * AI推定情報
 */
export type CmPageSuggestion = {
  rotation: number;
  client: { id: string; name: string } | null;
  docType: { id: number; name: string } | null;
  isAd: boolean;
  confidence: 'high' | 'medium' | 'low';
  isContinuation?: boolean;
  reason?: CmSuggestionReason;
};
