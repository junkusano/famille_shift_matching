// =============================================================
// src/components/cm-components/common/CmDateTimeLocalInput.tsx
// 日本時間でのdatetime-local入力（内部でUTC変換）
//
// 【目的】
// - datetime-local入力を日本時間として扱い、onChange時にUTC（ISO 8601）を返す
// - DBのtimestamptz（UTC）との検索条件を正しくマッチさせる
//
// 【使用例】
// <CmDateTimeLocalInput
//   value={filters.from}  // UTC ISO文字列 or 空文字
//   onChange={(utcValue) => onFilterChange('from', utcValue)}
// />
// =============================================================

'use client';

import React, { useMemo, useCallback } from 'react';

// 日本標準時のオフセット（+09:00）
const JST_OFFSET_MINUTES = 9 * 60;

type Props = {
  /** UTC ISO文字列（例: "2026-01-29T13:35:00.000Z"）または空文字 */
  value: string;
  /** 変更時コールバック（UTC ISO文字列を返す） */
  onChange: (utcIsoString: string) => void;
  /** 追加のクラス名 */
  className?: string;
  /** disabled状態 */
  disabled?: boolean;
  /** placeholder */
  placeholder?: string;
};

/**
 * UTC ISO文字列 → datetime-local用の文字列（日本時間表示）
 * 例: "2026-01-29T13:35:00.000Z" → "2026-01-29T22:35"
 */
function utcToDatetimeLocalValue(utcIso: string): string {
  if (!utcIso) return '';

  try {
    const date = new Date(utcIso);
    if (isNaN(date.getTime())) return '';

    // UTCから日本時間に変換
    const jstDate = new Date(date.getTime() + JST_OFFSET_MINUTES * 60 * 1000);

    // datetime-local形式（YYYY-MM-DDTHH:mm）に変換
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    const hours = String(jstDate.getUTCHours()).padStart(2, '0');
    const minutes = String(jstDate.getUTCMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

/**
 * datetime-local値（日本時間として解釈）→ UTC ISO文字列
 * 例: "2026-01-29T22:35" → "2026-01-29T13:35:00.000Z"
 */
function datetimeLocalValueToUtc(localValue: string): string {
  if (!localValue) return '';

  try {
    // datetime-local形式: "YYYY-MM-DDTHH:mm"
    // これを日本時間として解釈し、UTCに変換
    const [datePart, timePart] = localValue.split('T');
    if (!datePart || !timePart) return '';

    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);

    // 日本時間としてDateを作成（UTCとして作成し、JSTオフセットを引く）
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
    utcDate.setTime(utcDate.getTime() - JST_OFFSET_MINUTES * 60 * 1000);

    return utcDate.toISOString();
  } catch {
    return '';
  }
}

/**
 * 日本時間でのdatetime-local入力コンポーネント
 *
 * - 表示: UTC値を日本時間に変換して表示
 * - 入力: 日本時間として解釈し、UTCに変換してonChangeに渡す
 */
export function CmDateTimeLocalInput({
  value,
  onChange,
  className = '',
  disabled = false,
  placeholder,
}: Props) {
  // UTC → 表示用（日本時間）
  const displayValue = useMemo(() => utcToDatetimeLocalValue(value), [value]);

  // 入力変更時: 日本時間 → UTC
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const localValue = e.target.value;
      const utcValue = datetimeLocalValueToUtc(localValue);
      onChange(utcValue);
    },
    [onChange]
  );

  // デフォルトのスタイルクラス
  const defaultClassName =
    'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm ' +
    'focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors';

  return (
    <input
      type="datetime-local"
      value={displayValue}
      onChange={handleChange}
      className={className || defaultClassName}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}
