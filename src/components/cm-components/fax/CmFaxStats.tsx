// =============================================================
// src/components/cm-components/fax/CmFaxStats.tsx
// FAX一覧 - 統計カード
//
// 【修正】
// - 事業所未割当カードをクリック可能に変更
// - 選択状態のスタイルを適用
// =============================================================

'use client';

import React from 'react';
import type { CmFaxStats, CmFaxFilters } from '@/types/cm/fax';

type Props = {
  stats: CmFaxStats | null;
  currentStatus: CmFaxFilters['status'];
  onStatusChange: (status: CmFaxFilters['status']) => void;
};

export function CmFaxStats({ stats, currentStatus, onStatusChange }: Props) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4 rounded-xl bg-white/60 border border-gray-200 animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-12 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      key: 'all' as const,
      label: '全FAX',
      value: stats.total,
      textColor: 'text-gray-900',
      bgGradient: '',
      selectedBorder: 'border-teal-300 ring-2 ring-teal-100',
    },
    {
      key: 'pending' as const,
      label: '未処理',
      value: stats.pending,
      textColor: 'text-gray-900',
      bgGradient: '',
      selectedBorder: 'border-teal-300 ring-2 ring-teal-100',
    },
    {
      key: 'processing' as const,
      label: '処理中',
      value: stats.processing,
      textColor: 'text-blue-600',
      bgGradient: '',
      selectedBorder: 'border-blue-300 ring-2 ring-blue-100',
    },
    {
      key: 'completed' as const,
      label: '完了',
      value: stats.completed,
      textColor: 'text-emerald-600',
      bgGradient: '',
      selectedBorder: 'border-emerald-300 ring-2 ring-emerald-100',
    },
    {
      key: 'unassignedOffice' as const,
      label: '事業所未割当',
      value: stats.unassignedOffice,
      textColor: 'text-amber-700',
      bgGradient: 'bg-gradient-to-br from-amber-50 to-orange-50',
      selectedBorder: 'border-amber-400 ring-2 ring-amber-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((card) => {
        const isSelected = currentStatus === card.key;
        
        return (
          <button
            key={card.key}
            onClick={() => onStatusChange(card.key)}
            className={`p-4 rounded-xl border transition-all text-left ${
              card.bgGradient || (isSelected ? 'bg-white' : 'bg-white/60')
            } ${
              isSelected
                ? `${card.selectedBorder} shadow-sm`
                : 'border-gray-200 hover:bg-white hover:border-gray-300'
            } ${
              // 事業所未割当は常に特別な背景
              card.key === 'unassignedOffice' && !isSelected
                ? 'border-amber-200/60'
                : ''
            }`}
          >
            <div className={`text-2xl font-bold ${card.textColor}`}>
              {card.value}
            </div>
            <div className={`text-xs mt-1 ${
              card.key === 'unassignedOffice' ? 'text-amber-600' : 'text-gray-500'
            }`}>
              {card.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}