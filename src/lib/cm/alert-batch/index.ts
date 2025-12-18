// src/lib/cm/alert-batch/index.ts
// CMアラートバッチ処理 エントリーポイント

// オーケストレーター
export { cmAlertBatchOrchestrator } from "./orchestrator";

// プロセッサ（テスト用に公開）
export { cmProcessInsuranceAlerts, cmDetermineInsuranceAlert } from "./processors/insurance";
export { cmProcessNoManagerAlerts, cmDetermineNoManagerAlert } from "./processors/no-manager";

// ユーティリティ（テスト用に公開）
// NOTE: cmParseJapaneseDate は @/lib/cm/utils.ts から直接インポートすること
export {
  cmFormatDateISO,
  cmDifferenceInDays,
  cmGetToday,
} from "./utils/date-converter";

export {
  cmGetLatestInsurance,
  cmCheckHasValidNewInsurance,
  cmIsInvalidUserStatus,
  CM_INVALID_USER_STATUSES,
} from "./utils/common";

// リポジトリ（テスト用に公開）
export {
  cmCreateBatchRun,
  cmCompleteBatchRun,
  cmFailBatchRun,
  cmUpsertAlert,
  cmResolveAlert,
  cmResolveAlertsByClientTermination,
  cmFetchActiveClientsWithInsurance,
  cmFetchUsersMap,
  cmFetchUnresolvedAlerts,
} from "./utils/alert-repository";

// 型の再エクスポート
export type {
  CmBatchRunOptions,
  CmBatchRunResult,
  CmCategoryStats,
  CmBatchStats,
  CmBatchRunRecord,
  CmAlertCategory,
  CmInsuranceAlertType,
  CmNoManagerAlertType,
  CmAlertSeverity,
  CmAlertStatus,
  CmInsuranceAlertData,
  CmNoManagerAlertData,
  CmUpsertAlertInput,
  CmUpsertResult,
  CmInsuranceAlertDetails,
  CmNoManagerAlertDetails,
  CmAlertDetails,
  CmInsuranceRecord,
  CmClientRecord,
  CmClientWithInsurance,
  CmUserRecord,
  CmExistingAlertRecord,
} from "@/types/cm/alert-batch";