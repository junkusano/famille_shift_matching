// =============================================================
// src/types/cm/otherOffices.ts
// 他社事業所マスタ関連の型定義
// =============================================================

/**
 * 他社事業所情報
 * テーブル: cm_kaipoke_other_office
 */
export type CmOtherOffice = {
  /** 内部ID（bigint） */
  id: number;
  /** カイポケ事業所ID */
  kaipoke_office_id: string;
  /** サービス種別（例：介護予防支援、訪問介護など） */
  service_type: string | null;
  /** 事業者番号（10桁） */
  office_number: string | null;
  /** 事業所名 */
  office_name: string;
  /** サテライト事業所フラグ */
  is_satellite: boolean;
  /** 電話番号 */
  phone: string | null;
  /** FAX番号 */
  fax: string | null;
  /** 住所（単一カラム） */
  address: string | null;
  /** FAX代行番号（編集可能） */
  fax_proxy: string | null;
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
};

/**
 * ページネーション情報
 */
export type CmOtherOfficePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * 検索フィルター
 */
export type CmOtherOfficeFilters = {
  /** サービス種別 */
  serviceType: string;
  /** 事業所名（部分一致） */
  officeName: string;
  /** 事業者番号（部分一致） */
  officeNumber: string;
  /** FAX番号（部分一致） */
  faxNumber: string;
};

/**
 * APIレスポンス - 一覧取得
 */
export type CmOtherOfficesApiResponse = {
  ok: boolean;
  offices?: CmOtherOffice[];
  serviceTypes?: string[];
  pagination?: CmOtherOfficePagination;
  error?: string;
};

/**
 * APIレスポンス - 更新
 */
export type CmOtherOfficeUpdateResponse = {
  ok: boolean;
  office?: CmOtherOffice;
  error?: string;
};

/**
 * FAX代行番号更新リクエスト
 */
export type CmOtherOfficeFaxProxyUpdateRequest = {
  fax_proxy: string | null;
};

/**
 * フィルターのデフォルト値
 */
export const CM_OTHER_OFFICE_DEFAULT_FILTERS: CmOtherOfficeFilters = {
  serviceType: '',
  officeName: '',
  officeNumber: '',
  faxNumber: '',
};