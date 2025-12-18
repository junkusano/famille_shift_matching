// src/types/cm/alert-batch.ts
// CMアラートバッチ処理の型定義

// =============================================================
// バッチ実行関連
// =============================================================

/** バッチ実行オプション */
export type CmBatchRunOptions = {
  runType: "scheduled" | "manual";
  triggeredBy?: string;
};

/** バッチ実行結果 */
export type CmBatchRunResult = {
  ok: boolean;
  batchRunId: string;
  stats?: CmBatchStats;
  error?: string;
};

/** カテゴリ別統計 */
export type CmCategoryStats = {
  scanned: number;
  created: number;
  updated: number;
  resolved: number;
};

/** バッチ統計 */
export type CmBatchStats = {
  [category: string]: CmCategoryStats;
};

/** バッチ実行レコード */
export type CmBatchRunRecord = {
  id: string;
  run_type: string;
  triggered_by: string | null;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  stats: CmBatchStats;
  created_at: string;
};

// =============================================================
// アラート関連
// =============================================================

/** アラートカテゴリ */
export type CmAlertCategory = "insurance" | "no_manager";

/** 被保険者証アラートタイプ */
export type CmInsuranceAlertType = "expired" | "expiring_soon";

/** 担当者未設定アラートタイプ */
export type CmNoManagerAlertType = "unassigned" | "resigned";

/** アラート重要度 */
export type CmAlertSeverity = "critical" | "warning" | "info";

/** アラートステータス */
export type CmAlertStatus = "unread" | "read" | "applying" | "resolved";

/** 被保険者証アラート判定結果 */
export type CmInsuranceAlertData = {
  type: CmInsuranceAlertType;
  severity: CmAlertSeverity;
} | null;

/** 担当者未設定アラート判定結果 */
export type CmNoManagerAlertData = {
  type: CmNoManagerAlertType;
  previousManagerName: string | null;
  previousManagerStatus: string | null;
} | null;

// =============================================================
// DB操作関連
// =============================================================

/** アラート UPSERT 入力 */
export type CmUpsertAlertInput = {
  kaipoke_cs_id: string;
  client_name: string;
  category: CmAlertCategory;
  alert_type: string;
  severity: CmAlertSeverity;
  details: CmAlertDetails;
  batch_run_id: string;
};

/** アラート UPSERT 結果 */
export type CmUpsertResult = {
  created: boolean;
  updated: boolean;
  alertId: string;
};

/** 被保険者証アラート details */
export type CmInsuranceAlertDetails = {
  reference_id: string;
  due_date: string;
  days_until_due: number;
  care_level: string | null;
};

/** 担当者未設定アラート details */
export type CmNoManagerAlertDetails = {
  reference_id: string;
  care_manager_kaipoke_id: string | null;
  previous_manager_name: string | null;
  previous_manager_status: string | null;
};

/** アラート details 共用型 */
export type CmAlertDetails = CmInsuranceAlertDetails | CmNoManagerAlertDetails;

// =============================================================
// データソース関連
// =============================================================

/**
 * 被保険者証レコード（cm_kaipoke_insurance）
 */
export type CmInsuranceRecord = {
  kaipoke_insurance_id: string;
  kaipoke_cs_id: string;
  coverage_start: string | null;
  coverage_end: string | null;
  care_level: string | null;
};

/**
 * 支援事業所レコード（cm_kaipoke_support_office）
 * 
 * 担当ケアマネ情報はこのテーブルにある
 * 紐付け: care_manager_kaipoke_id → users.kaipoke_user_id
 */
export type CmSupportOfficeRecord = {
  kaipoke_cs_id: string;
  kaipoke_insurance_id: string;
  apply_start: string;
  care_manager_kaipoke_id: string | null;
  care_manager_name: string | null;
};

/**
 * 被保険者証 + 支援事業所情報
 * 
 * cm_kaipoke_insurance と cm_kaipoke_support_office を結合した型
 */
export type CmInsuranceWithSupport = CmInsuranceRecord & {
  support_office: {
    care_manager_kaipoke_id: string | null;
    care_manager_name: string | null;
    apply_start: string;
  } | null;
};

/** 利用者レコード（cm_kaipoke_info） */
export type CmClientRecord = {
  kaipoke_cs_id: string;
  name: string;
  status: string;
};

/** 利用者 + 被保険者証（支援事業所情報含む） */
export type CmClientWithInsurance = CmClientRecord & {
  insurances: CmInsuranceWithSupport[];
};

/**
 * ユーザーレコード（users）
 * 
 * 紐付け: kaipoke_user_id で cm_kaipoke_support_office.care_manager_kaipoke_id と結合
 * 用途: 担当ケアマネが退職済みかどうかの判定
 * 名前は cm_kaipoke_support_office.care_manager_name を使うため不要
 */
export type CmUserRecord = {
  kaipoke_user_id: string;
  status: string;
};

/** 既存アラートレコード（cm_alerts） */
export type CmExistingAlertRecord = {
  id: string;
  alert_type: string;
  severity: string;
  details: Record<string, unknown>;
  status: string;
};