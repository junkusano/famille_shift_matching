// =============================================================
// src/components/cm-components/fax/CmFaxSuggestionCard.tsx
// FAX詳細 - AI推定カード
//
// 【v3.1対応】
// - 紫系カラー（indigo）
// - 信頼度を%で表示（88%）
// - 理由を常に表示（イタリック）
// - 利用者ごとの信頼度表示
// =============================================================

'use client';

import React from 'react';
import { Brain, Sparkles, Loader2 } from 'lucide-react';
import type { CmPageSuggestion } from '@/types/cm/faxDetail';

type Props = {
  suggestion: CmPageSuggestion;
  onApply: () => void;
  isApplying?: boolean;
};

export function CmFaxSuggestionCard({
  suggestion,
  onApply,
  isApplying = false,
}: Props) {
  // 信頼度を%に変換（0-1の場合は100倍、すでに%の場合はそのまま）
  const toPercent = (value: number | undefined): number => {
    if (value === undefined) return 0;
    return value > 1 ? Math.round(value) : Math.round(value * 100);
  };

  // 文書種別の信頼度
  const docTypeConfidence = toPercent(suggestion.docType?.confidence);

  // 利用者情報の整形
  const clientsWithConfidence = suggestion.clients?.map((c) => ({
    name: c.client_name || '不明',
    confidence: toPercent(c.confidence),
  })) ?? [];

  return (
    <div className="p-3 bg-indigo-50 border-b border-indigo-100">
      {/* ヘッダー: AI推定 + 信頼度バッジ */}
      <div className="flex items-center gap-2 mb-2">
        <Brain className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-medium text-indigo-900">AI推定</span>
        {docTypeConfidence > 0 && (
          <span className="ml-auto text-xs px-1.5 py-0.5 bg-indigo-200 text-indigo-700 rounded">
            {docTypeConfidence}%
          </span>
        )}
      </div>

      {/* 推定内容 */}
      <div className="text-xs text-indigo-800 space-y-1 mb-2">
        {/* 利用者 */}
        {clientsWithConfidence.length > 0 && (
          <p>
            <span className="text-indigo-500">利用者:</span>{' '}
            {clientsWithConfidence
              .map((c) => `${c.name} (${c.confidence}%)`)
              .join(', ')}
          </p>
        )}

        {/* 文書種別 */}
        {suggestion.docType && (
          <p>
            <span className="text-indigo-500">文書:</span>{' '}
            {suggestion.docType.name}
          </p>
        )}

        {/* 広告判定 */}
        {suggestion.is_advertisement && (
          <p className="text-orange-600 font-medium">
            ※ 広告として判定されました
          </p>
        )}

        {/* 推定理由（常に表示、イタリック） */}
        {suggestion.reason && (
          <p className="text-indigo-600 italic">{suggestion.reason}</p>
        )}
      </div>

      {/* 適用ボタン */}
      <button
        onClick={onApply}
        disabled={isApplying}
        className="w-full py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isApplying ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            適用中...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            この内容で保存
          </>
        )}
      </button>
    </div>
  );
}