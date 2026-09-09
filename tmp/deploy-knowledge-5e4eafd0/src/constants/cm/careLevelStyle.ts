// =============================================================
// src/constants/cm/careLevelStyle.ts
// 介護度バッジのスタイル定数
//
// variant（意味値）→ CSSProperties のマッピング。
// variant は lib/cm/utils.ts の cmGetCareLevelDisplay が返す。
// =============================================================

import type { CmCareLevelVariant } from '@/types/cm/clients';

/**
 * 介護度バッジのインラインスタイル定数
 *
 * 色値は Tailwind のカラーパレットに準拠:
 *   要介護:      orange-100 / orange-700
 *   要支援:      blue-100 / blue-700
 *   事業対象者:  green-100 / green-700
 *   デフォルト:  slate-100 / slate-600
 *   未入力:      slate-100 / slate-500
 *   有効期限切れ: red-100 / red-700
 */
export const CM_CARE_LEVEL_STYLES: Record<
  CmCareLevelVariant,
  { backgroundColor: string; color: string }
> = {
  youkaigo: { backgroundColor: '#fff7ed', color: '#c2410c' },
  youshien: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  jigyou:   { backgroundColor: '#dcfce7', color: '#15803d' },
  default:  { backgroundColor: '#f1f5f9', color: '#475569' },
  empty:    { backgroundColor: '#f1f5f9', color: '#64748b' },
  expired:  { backgroundColor: '#fee2e2', color: '#b91c1c' },
} as const;
