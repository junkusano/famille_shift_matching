// =============================================================
// src/constants/cm/guardianType.ts
// 後見人種別の表示ラベル定数
// =============================================================

import type { CmGuardianType } from '@/types/cm/selectOptions';

/**
 * 後見人種別の表示ラベル
 */
export const CM_GUARDIAN_TYPE_LABELS: Record<CmGuardianType, string> = {
  legal: '成年後見人',
  curator: '保佐人',
  assistant: '補助人',
};
