// =============================================================
// src/lib/cm/selectOptions.ts
// 選択肢マスタ関連のヘルパー関数
// =============================================================

import type { CmSelectOption } from '@/types/cm/selectOptions';

/**
 * 選択肢の表示値を取得
 * 「その他」の場合は「その他（具体的内容）」形式で返す
 */
export function getSelectDisplayValue(
  code: string,
  otherText: string | null | undefined,
  options: CmSelectOption[]
): string {
  const option = options.find((o) => o.code === code);
  if (!option) return code || '';

  if (option.requires_input && otherText) {
    return `${option.label}（${otherText}）`;
  }
  return option.label;
}

/**
 * 選択肢が「その他」かどうかを判定
 */
export function isOtherOption(code: string, options: CmSelectOption[]): boolean {
  const option = options.find((o) => o.code === code);
  return option?.requires_input ?? false;
}
