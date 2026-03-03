// =============================================================
// src/constants/cm/operationLogActions.ts
// 操作ログのアクション定数
// 新しい書き込み操作を追加する場合、ここに定数を追加してから使用すること
// 命名規則: 定数名 CM_OP_LOG_ + カテゴリ + _ + 動詞 / 値 カテゴリ.動詞
// =============================================================

// --- 利用者 ---
export const CM_OP_LOG_CLIENT_SEARCH = "client.search";
export const CM_OP_LOG_CLIENT_UPDATE = "client.update";

// --- 契約 ---
export const CM_OP_LOG_CONSENT_CREATE = "contract.create-consent";
export const CM_OP_LOG_CONTRACT_UPDATE = "contract.update";
export const CM_OP_LOG_CONTRACT_CREATE = "contract.create";

// --- FAX電話帳 ---
export const CM_OP_LOG_PHONEBOOK_CREATE = "phonebook.create";
export const CM_OP_LOG_PHONEBOOK_UPDATE = "phonebook.update";
export const CM_OP_LOG_PHONEBOOK_DELETE = "phonebook.delete";
export const CM_OP_LOG_PHONEBOOK_SYNC = "phonebook.sync";

// --- 他事業所 ---
export const CM_OP_LOG_OTHER_OFFICE_UPDATE_FAX_PROXY =
  "other-office.update-fax-proxy";

// --- アラートバッチ ---
export const CM_OP_LOG_ALERT_BATCH_RUN = "alert-batch.run";

// --- RPAジョブ ---
export const CM_OP_LOG_RPA_JOB_CREATE = "rpa-job.create";
export const CM_OP_LOG_RPA_JOB_UPDATE = "rpa-job.update";

// --- スケジュール ---
export const CM_OP_LOG_SCHEDULE_ADD = "schedule.add";
export const CM_OP_LOG_SCHEDULE_UPDATE = "schedule.update";
export const CM_OP_LOG_SCHEDULE_REMOVE = "schedule.remove";
export const CM_OP_LOG_SCHEDULE_REORDER = "schedule.reorder";
export const CM_OP_LOG_SCHEDULE_TOGGLE = "schedule.toggle";
export const CM_OP_LOG_SCHEDULE_EXECUTE_ALL = "schedule.execute-all";
export const CM_OP_LOG_SCHEDULE_EXECUTE_SINGLE = "schedule.execute-single";

// --- 認証情報 ---
export const CM_OP_LOG_CREDENTIAL_CREATE = "credential.create";
export const CM_OP_LOG_CREDENTIAL_UPDATE = "credential.update";
export const CM_OP_LOG_CREDENTIAL_DELETE = "credential.delete";

// --- Plaud ---
export const CM_OP_LOG_PLAUD_GENERATE = "plaud.generate";
export const CM_OP_LOG_PLAUD_UPDATE_CLIENT = "plaud.update-client";
export const CM_OP_LOG_PLAUD_EXECUTE_ACTION = "plaud.execute-action";
export const CM_OP_LOG_PLAUD_TEMPLATE_CREATE = "plaud.template-create";
export const CM_OP_LOG_PLAUD_TEMPLATE_UPDATE = "plaud.template-update";
export const CM_OP_LOG_PLAUD_TEMPLATE_DELETE = "plaud.template-delete";

// --- RPA API Route ---
export const CM_OP_LOG_RPA_CLIENT_INFO = "rpa-api.client-info";
export const CM_OP_LOG_RPA_OTHER_OFFICE = "rpa-api.other-office";
export const CM_OP_LOG_RPA_SERVICE_USAGE = "rpa-api.service-usage";
export const CM_OP_LOG_RPA_STAFF_INFO = "rpa-api.staff-info";

// --- FAX API Route ---
export const CM_OP_LOG_FAX_LIST = "fax.list";
export const CM_OP_LOG_FAX_DOCUMENTS = "fax.documents";
export const CM_OP_LOG_FAX_DOCUMENT_PAGES = "fax.document-pages";
export const CM_OP_LOG_FAX_ASSIGN_OFFICE = "fax.assign-office";

// -------------------------------------------------------------
// ユーティリティ: アクション名からカテゴリを自動抽出
// "client.update" → "client", "rpa-api.client-info" → "rpa-api"
// recordOperationLog で category 未指定時に使用する
// -------------------------------------------------------------

export function cmGetCategoryFromAction(action: string): string {
  const dotIndex = action.indexOf(".");
  return dotIndex >= 0 ? action.substring(0, dotIndex) : "general";
}