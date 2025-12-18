// src/lib/cm/alert-batch/processors/no-manager.ts
// 担当者未設定アラートプロセッサ
//
// 担当ケアマネ情報の取得元:
//   cm_kaipoke_support_office.care_manager_kaipoke_id
//   cm_kaipoke_support_office.care_manager_name
//
// 紐付け:
//   cm_kaipoke_support_office.care_manager_kaipoke_id → users.kaipoke_user_id

import type {
  CmCategoryStats,
  CmNoManagerAlertData,
  CmNoManagerAlertDetails,
  CmUserRecord,
} from "@/types/cm/alert-batch";
import {
  cmFetchActiveClientsWithInsurance,
  cmFetchUsersMap,
  cmUpsertAlert,
  cmResolveAlert,
  cmResolveAlertsByClientTermination,
} from "../utils/alert-repository";
import { cmGetLatestInsurance, cmIsInvalidUserStatus } from "../utils/common";

// ログメソッドの共通インターフェース（Logger / TracedLogger 両方で使える）
type CmLogMethods = {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: Error | unknown, context?: Record<string, unknown>) => void;
};

/**
 * 担当者未設定アラート判定
 * 
 * @param careManagerKaipokeId 担当ケアマネID（cm_kaipoke_support_office.care_manager_kaipoke_id）
 * @param careManagerName 担当ケアマネ名（cm_kaipoke_support_office.care_manager_name）
 * @param usersMap ユーザーマスタ（kaipoke_user_id -> CmUserRecord）
 * @returns アラートデータ（nullの場合はアラートなし＝有効な担当者あり）
 * 
 * 判定ロジック:
 *   1. care_manager_kaipoke_id が null/空 → unassigned
 *   2. users に該当なし → unassigned（自社スタッフではない）
 *   3. users.status が退職系 → resigned
 *   4. 上記以外 → アラートなし（有効な担当者あり）
 */
export function cmDetermineNoManagerAlert(
  careManagerKaipokeId: string | null | undefined,
  careManagerName: string | null | undefined,
  usersMap: Map<string, CmUserRecord>
): CmNoManagerAlertData {
  // ケース1: 担当者ID が null / undefined / 空文字
  if (!careManagerKaipokeId || careManagerKaipokeId.trim() === "") {
    return {
      type: "unassigned",
      previousManagerName: null,
      previousManagerStatus: null,
    };
  }

  // ケース2: users テーブルに該当なし（自社スタッフではない）
  const user = usersMap.get(careManagerKaipokeId);
  if (!user) {
    return {
      type: "unassigned",
      previousManagerName: careManagerName ?? null,
      previousManagerStatus: null,
    };
  }

  // ケース3: ユーザーが無効ステータス（退職済み等）
  if (cmIsInvalidUserStatus(user.status)) {
    return {
      type: "resigned",
      previousManagerName: careManagerName ?? null,
      previousManagerStatus: user.status,
    };
  }

  // 有効な担当者 → アラートなし
  return null;
}

/**
 * 担当者未設定アラート処理のメインエントリーポイント
 */
export async function cmProcessNoManagerAlerts(
  batchRunId: string,
  logger: CmLogMethods
): Promise<CmCategoryStats> {
  const stats: CmCategoryStats = { scanned: 0, created: 0, updated: 0, resolved: 0 };

  try {
    // 1. 利用中の利用者 × 被保険者証を取得
    const clients = await cmFetchActiveClientsWithInsurance();
    logger.info("担当者未設定: 対象利用者取得", { count: clients.length });

    // 2. ユーザーマスタを取得
    const usersMap = await cmFetchUsersMap();
    logger.info("担当者未設定: ユーザーマスタ取得", { count: usersMap.size });

    for (const client of clients) {
      stats.scanned++;

      try {
        // 3. 最新の被保険者証を特定
        const latestInsurance = cmGetLatestInsurance(client.insurances);
        if (!latestInsurance) {
          logger.debug?.("被保険者証なし", { kaipoke_cs_id: client.kaipoke_cs_id });
          continue;
        }

        // 4. 担当者情報を取得（support_office から）
        const careManagerKaipokeId = latestInsurance.support_office?.care_manager_kaipoke_id;
        const careManagerName = latestInsurance.support_office?.care_manager_name;

        // 5. 担当者判定
        const alertData = cmDetermineNoManagerAlert(careManagerKaipokeId, careManagerName, usersMap);

        if (alertData) {
          // 6. アラート作成/更新
          const details: CmNoManagerAlertDetails = {
            reference_id: latestInsurance.kaipoke_insurance_id,
            care_manager_kaipoke_id: careManagerKaipokeId ?? null,
            previous_manager_name: alertData.previousManagerName,
            previous_manager_status: alertData.previousManagerStatus,
          };

          const result = await cmUpsertAlert({
            kaipoke_cs_id: client.kaipoke_cs_id,
            client_name: client.name,
            category: "no_manager",
            alert_type: alertData.type,
            severity: "critical", // 担当者未設定は常にcritical
            details,
            batch_run_id: batchRunId,
          });

          if (result.created) {
            stats.created++;
            logger.debug?.("アラート作成", {
              kaipoke_cs_id: client.kaipoke_cs_id,
              alert_type: alertData.type,
            });
          } else if (result.updated) {
            stats.updated++;
            logger.debug?.("アラート更新", {
              kaipoke_cs_id: client.kaipoke_cs_id,
              alert_type: alertData.type,
            });
          }
        } else {
          // 7. 有効な担当者が設定された場合は既存アラートを解消
          const resolved = await cmResolveAlert(
            client.kaipoke_cs_id,
            "no_manager",
            latestInsurance.kaipoke_insurance_id,
            "有効な担当者が設定された"
          );
          if (resolved) {
            stats.resolved++;
            logger.debug?.("アラート解消（担当者設定）", {
              kaipoke_cs_id: client.kaipoke_cs_id,
            });
          }
        }
      } catch (clientError) {
        // 個別クライアントのエラーはログして続行
        logger.warn("クライアント処理エラー", {
          kaipoke_cs_id: client.kaipoke_cs_id,
          error: String(clientError),
        });
      }
    }

    // 8. 利用終了者のアラート解消
    const resolvedByTermination = await cmResolveAlertsByClientTermination("no_manager");
    stats.resolved += resolvedByTermination;
    if (resolvedByTermination > 0) {
      logger.info("利用終了者アラート解消", { count: resolvedByTermination });
    }

    logger.info("処理完了", { stats });
    return stats;

  } catch (error) {
    logger.error("処理失敗", error as Error);
    throw error;
  }
}