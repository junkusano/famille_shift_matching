// =============================================================
// src/lib/cm/local-fax-phonebook/gasClient.ts
// GAS Web App API クライアント（ローカルFAX電話帳 XML操作）
// =============================================================

import { createLogger } from "@/lib/common/logger";
import { getServiceUrl, SERVICE_NAMES } from "@/lib/cm/serviceCredentials";
import type {
  CmPhonebookGasAddRequest,
  CmPhonebookGasAddResponse,
  CmPhonebookGasUpdateRequest,
  CmPhonebookGasDeleteRequest,
  CmPhonebookGasUpdateDeleteResponse,
  CmPhonebookGasSyncRequest,
  CmPhonebookGasSyncResponse,
} from "@/types/cm/localFaxPhonebook";

const logger = createLogger("lib/cm/local-fax-phonebook/gasClient");

// =============================================================
// Types
// =============================================================

export type GasClientResult<T> =
  | { ok: true; data: T; error?: undefined }
  | { ok: false; error: string; data?: undefined };

// =============================================================
// GAS URL 取得（共通）
// =============================================================

async function getGasUrl(): Promise<string | null> {
  return getServiceUrl(SERVICE_NAMES.LOCAL_FAX_PHONEBOOK_GAS);
}

// =============================================================
// GAS API 共通リクエスト
// =============================================================

async function callGasApi<TReq, TRes>(
  request: TReq,
  operationName: string,
): Promise<GasClientResult<TRes>> {
  const gasWebAppUrl = await getGasUrl();

  if (!gasWebAppUrl) {
    logger.warn(`GAS URLが未設定のため${operationName}をスキップ`);
    return { ok: false, error: "GAS Web App URLが設定されていません" };
  }

  try {
    const response = await fetch(gasWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      logger.error(`GAS API ${operationName} HTTPエラー`, { status: response.status });
      return { ok: false, error: `GAS APIエラー (HTTP ${response.status})` };
    }

    const result = await response.json() as TRes;
    return { ok: true, data: result };
  } catch (error) {
    logger.error(`GAS API ${operationName} 通信エラー`, error);
    return { ok: false, error: "XMLサーバーとの通信に失敗しました" };
  }
}

// =============================================================
// 公開API
// =============================================================

/**
 * XMLにエントリを追加し、source_id を返す
 */
export async function gasAddEntry(params: {
  name: string;
  nameKana?: string;
  faxNumber?: string;
}): Promise<GasClientResult<{ sourceId: string | null }>> {
  const request: CmPhonebookGasAddRequest = {
    action: "add",
    name: params.name,
    name_kana: params.nameKana,
    fax_number: params.faxNumber,
  };

  const result = await callGasApi<CmPhonebookGasAddRequest, CmPhonebookGasAddResponse>(
    request,
    "XML追加",
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  if (!result.data.ok) {
    logger.error("GAS API追加エラー", { error: result.data.error });
    return { ok: false, error: result.data.error || "XMLへの追加に失敗しました" };
  }

  logger.info("GAS API追加成功", { sourceId: result.data.source_id });
  return { ok: true, data: { sourceId: result.data.source_id || null } };
}

/**
 * XMLのエントリを更新する
 * 失敗してもDB更新は続行するため、成功/失敗を返すのみ
 */
export async function gasUpdateEntry(params: {
  sourceId: string;
  name?: string;
  nameKana?: string;
  faxNumber?: string;
}): Promise<{ ok: boolean }> {
  const request: CmPhonebookGasUpdateRequest = {
    action: "update",
    source_id: params.sourceId,
    name: params.name,
    name_kana: params.nameKana,
    fax_number: params.faxNumber,
  };

  const result = await callGasApi<CmPhonebookGasUpdateRequest, CmPhonebookGasUpdateDeleteResponse>(
    request,
    "XML更新",
  );

  if (!result.ok) {
    logger.warn("XMLの更新に失敗しましたが、DB更新は続行します");
    return { ok: false };
  }

  if (!result.data.ok) {
    logger.warn("GAS API更新エラー（DB更新は続行）", { error: result.data.error });
    return { ok: false };
  }

  logger.info("GAS API更新成功", { sourceId: params.sourceId });
  return { ok: true };
}

/**
 * XMLからエントリを削除する
 * 失敗時はエラーを返す（DB削除を中止する判断用）
 */
export async function gasDeleteEntry(sourceId: string): Promise<GasClientResult<void>> {
  const request: CmPhonebookGasDeleteRequest = {
    action: "delete",
    source_id: sourceId,
  };

  const result = await callGasApi<CmPhonebookGasDeleteRequest, CmPhonebookGasUpdateDeleteResponse>(
    request,
    "XML削除",
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  if (!result.data.ok) {
    logger.error("GAS API削除エラー", { error: result.data.error });
    return { ok: false, error: result.data.error || "XMLからの削除に失敗しました" };
  }

  logger.info("GAS API削除成功", { sourceId });
  return { ok: true, data: undefined };
}

/**
 * XML全体とDB全体の同期を実行する
 */
export async function gasSyncAll(): Promise<GasClientResult<CmPhonebookGasSyncResponse>> {
  const gasWebAppUrl = await getGasUrl();

  if (!gasWebAppUrl) {
    return {
      ok: false,
      error: "GAS Web App URLが設定されていません。サービス認証情報を登録してください。",
    };
  }

  const request: CmPhonebookGasSyncRequest = { action: "sync" };

  const result = await callGasApi<CmPhonebookGasSyncRequest, CmPhonebookGasSyncResponse>(
    request,
    "XML同期",
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  if (!result.data.ok) {
    logger.error("GAS API同期エラー", { error: result.data.error });
    return { ok: false, error: result.data.error || "同期処理に失敗しました" };
  }

  logger.info("GAS API同期成功", {
    xmlOnly: result.data.summary.xmlOnly,
    dbOnly: result.data.summary.dbOnly,
    different: result.data.summary.different,
    duration: result.data.summary.duration,
  });

  return { ok: true, data: result.data };
}

/**
 * GAS URLが設定されているかチェック
 */
export async function isGasConfigured(): Promise<boolean> {
  const url = await getGasUrl();
  return url !== null;
}