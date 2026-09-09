// src/lib/cm/alert-batch/utils/common.ts
// 共通ユーティリティ関数（alert-batch専用）
//
// NOTE: 汎用的な日付・被保険者証操作は @/lib/cm/utils.ts を使用

import type { CmInsuranceRecord } from "@/types/cm/alert-batch";
import { cmParseJapaneseDate, cmSortInsurances } from "@/lib/cm/utils";
import { cmDifferenceInDays } from "./date-converter";

/**
 * 複数の被保険者証から最新（有効期間終了が最も遅い）を取得
 * 既存の cmSortInsurances を活用して、期限切れでも最新のものを返す
 */
export function cmGetLatestInsurance<T extends {
  coverage_start: string;
  coverage_end: string;
}>(insurances: T[]): T | null {
  if (insurances.length === 0) return null;

  // cmSortInsurances は有効→将来→期限切れ（新しい順）でソート
  // 先頭が「現在有効」または「最も新しい期限切れ」となる
  const sorted = cmSortInsurances(insurances);
  return sorted[0] ?? null;
}

/**
 * 新しい有効な被保険者証が存在するかチェック
 * @param insurances 被保険者証リスト
 * @param currentReferenceId 現在のアラート対象の被保険者証ID
 * @param today 基準日
 */
export function cmCheckHasValidNewInsurance(
  insurances: CmInsuranceRecord[],
  currentReferenceId: string,
  today: Date
): boolean {
  for (const ins of insurances) {
    // 現在のアラート対象は除外
    if (ins.kaipoke_insurance_id === currentReferenceId) continue;

    const coverageEnd = cmParseJapaneseDate(ins.coverage_end);
    if (!coverageEnd) continue;

    const daysUntilDue = cmDifferenceInDays(coverageEnd, today);

    // 60日以上有効な被保険者証があれば「新しい有効な被保険者証」とみなす
    if (daysUntilDue > 60) {
      return true;
    }
  }

  return false;
}

/**
 * 無効とみなすユーザーステータスのリスト
 */
export const CM_INVALID_USER_STATUSES = [
  "inactive",
  "removed_from_lineworks_kaipoke",
] as const;

/**
 * ユーザーステータスが無効かどうかを判定
 */
export function cmIsInvalidUserStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return CM_INVALID_USER_STATUSES.includes(status as typeof CM_INVALID_USER_STATUSES[number]);
}