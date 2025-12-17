// =============================================================
// src/types/cm/clients.ts
// CM利用者関連の型定義
// =============================================================

/**
 * 被保険者証情報
 */
export type CmInsuranceInfo = {
  kaipoke_insurance_id: string;
  coverage_start: string;
  coverage_end: string;
  insurer_code: string;
  insurer_name: string | null;
  insured_number: string;
  care_level: string | null;
  cert_status: string | null;
};

/**
 * 利用者情報
 */
export type CmClientInfo = {
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
  insurances: CmInsuranceInfo[];
};

/**
 * ページネーション情報
 */
export type CmPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * 利用者一覧APIレスポンス
 */
export type CmClientsApiResponse = {
  ok: boolean;
  clients?: CmClientInfo[];
  insurerOptions?: string[];
  pagination?: CmPagination;
  error?: string;
};

/**
 * 利用者一覧フィルター
 */
export type CmClientFilters = {
  search: string;
  status: string;
  insurer: string;
};