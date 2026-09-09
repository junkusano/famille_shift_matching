// src/lib/cm/alert-batch/processors/insurance.ts
// 被保険者証アラートプロセッサ

import type {
  CmCategoryStats,
  CmInsuranceAlertData,
  CmInsuranceAlertDetails,
} from "@/types/cm/alert-batch";
import { cmParseJapaneseDate } from "@/lib/cm/utils";
import {
  cmFetchActiveClientsWithInsurance,
  cmUpsertAlert,
  cmResolveAlert,
  cmResolveAlertsByClientTermination,
} from "../utils/alert-repository";
import {
  cmFormatDateISO,
  cmDifferenceInDays,
  cmGetToday,
} from "../utils/date-converter";
import { cmGetLatestInsurance, cmCheckHasValidNewInsurance } from "../utils/common";

// ログメソッドの共通インターフェース（Logger / TracedLogger 両方で使える）
type CmLogMethods = {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: Error | unknown, context?: Record<string, unknown>) => void;
};

/**
 * 被保険者証アラート判定
 * @param daysUntilDue 期限までの日数（負数 = 期限切れ）
 * @returns アラートデータ（nullの場合はアラートなし）
 */
export function cmDetermineInsuranceAlert(daysUntilDue: number): CmInsuranceAlertData {
  if (daysUntilDue < 0) {
    // 期限切れ
    return { type: "expired", severity: "critical" };
  } else if (daysUntilDue <= 30) {
    // 30日以内 → critical
    return { type: "expiring_soon", severity: "critical" };
  } else if (daysUntilDue <= 60) {
    // 60日以内 → warning
    return { type: "expiring_soon", severity: "warning" };
  }
  // 60日超 → アラートなし
  return null;
}

/**
 * 被保険者証アラート処理のメインエントリーポイント
 */
export async function cmProcessInsuranceAlerts(
  batchRunId: string,
  logger: CmLogMethods
): Promise<CmCategoryStats> {
  const stats: CmCategoryStats = { scanned: 0, created: 0, updated: 0, resolved: 0 };
  const today = cmGetToday();

  try {
    // 1. 利用中の利用者 × 被保険者証を取得
    const clients = await cmFetchActiveClientsWithInsurance();
    logger.info("被保険者証: 対象利用者取得", { count: clients.length });

    for (const client of clients) {
      stats.scanned++;

      try {
        // 2. 最新の被保険者証を特定
        const latestInsurance = cmGetLatestInsurance(client.insurances);
        if (!latestInsurance) {
          logger.debug?.("被保険者証なし", { kaipoke_cs_id: client.kaipoke_cs_id });
          continue;
        }

        // 3. 期限判定
        const coverageEnd = cmParseJapaneseDate(latestInsurance.coverage_end);
        if (!coverageEnd) {
          logger.warn("日付パース失敗", {
            kaipoke_cs_id: client.kaipoke_cs_id,
            coverage_end: latestInsurance.coverage_end,
          });
          continue;
        }

        const daysUntilDue = cmDifferenceInDays(coverageEnd, today);
        const alertData = cmDetermineInsuranceAlert(daysUntilDue);

        if (alertData) {
          // 4. アラート作成/更新
          const details: CmInsuranceAlertDetails = {
            reference_id: latestInsurance.kaipoke_insurance_id,
            due_date: cmFormatDateISO(coverageEnd),
            days_until_due: daysUntilDue,
            care_level: latestInsurance.care_level,
          };

          const result = await cmUpsertAlert({
            kaipoke_cs_id: client.kaipoke_cs_id,
            client_name: client.name,
            category: "insurance",
            alert_type: alertData.type,
            severity: alertData.severity,
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
          // 5. アラート対象外の場合、既存アラートの解消チェック
          // 新しい有効な被保険者証がある場合は解消
          const hasValidNew = cmCheckHasValidNewInsurance(
            client.insurances,
            latestInsurance.kaipoke_insurance_id,
            today
          );

          if (hasValidNew) {
            const resolved = await cmResolveAlert(
              client.kaipoke_cs_id,
              "insurance",
              latestInsurance.kaipoke_insurance_id,
              "新しい有効な被保険者証が存在"
            );
            if (resolved) {
              stats.resolved++;
              logger.debug?.("アラート解消（新規保険証）", {
                kaipoke_cs_id: client.kaipoke_cs_id,
              });
            }
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

    // 6. 利用終了者のアラート解消
    const resolvedByTermination = await cmResolveAlertsByClientTermination("insurance");
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