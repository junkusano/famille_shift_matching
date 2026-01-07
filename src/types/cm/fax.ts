// =============================================================
// src/types/cm/fax.ts
// FAX関連の型定義
// =============================================================

/**
 * FAXページ情報
 */
export type CmFaxPage = {
  id: number;
  fax_received_id: number;
  page_number: number;
  ocr_status: 'pending' | 'completed' | 'failed';
  assigned_at: string | null;
  is_advertisement: boolean;
};

/**
 * 候補利用者
 */
export type CmFaxCandidateClient = {
  id: string;
  name: string;
  kana: string;
};

/**
 * FAX受信レコード
 */
export type CmFaxReceived = {
  id: number;
  gmail_message_id: string;
  fax_number: string;
  office_id: number | null;
  office_name: string | null;
  office_assigned_by: string | null;
  office_assigned_at: string | null;
  file_name: string;
  file_path: string;
  file_id: string;
  page_count: number;
  status: string;
  candidate_clients: CmFaxCandidateClient[];
  received_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  // 集計用（APIで計算）
  assigned_page_count: number;
  is_all_advertisement: boolean;
};

/**
 * FAX一覧フィルター
 */
export type CmFaxFilters = {
  assignment: 'mine' | 'all';
  status: 'all' | 'pending' | 'processing' | 'completed';
  search: string;
};

/**
 * FAX一覧ソート設定
 */
export type CmFaxSortConfig = {
  key: 'receivedAt' | 'officeName' | 'progress' | 'pageCount';
  direction: 'asc' | 'desc';
};

/**
 * FAX統計情報
 */
export type CmFaxStats = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  unassignedOffice: number;
};

/**
 * ページネーション情報
 */
export type CmFaxPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * FAX一覧APIレスポンス
 */
export type CmFaxListApiResponse = {
  ok: boolean;
  faxList?: CmFaxReceived[];
  stats?: CmFaxStats;
  pagination?: CmFaxPagination;
  myAssignedOfficeIds?: number[];
  error?: string;
};

/**
 * 担当事業所ID取得APIレスポンス
 */
export type CmFaxAssignedOfficesResponse = {
  ok: boolean;
  officeIds?: number[];
  error?: string;
};
