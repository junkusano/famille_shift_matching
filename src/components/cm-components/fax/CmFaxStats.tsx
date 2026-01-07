// =============================================================
// src/components/cm-components/fax/CmFaxStats.tsx
// FAX一覧 - 統計カード
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
      isHighlight: false,
    },
    {
      key: 'pending' as const,
      label: '未処理',
      value: stats.pending,
      textColor: 'text-gray-900',
      isHighlight: false,
    },
    {
      key: 'processing' as const,
      label: '処理中',
      value: stats.processing,
      textColor: 'text-blue-600',
      isHighlight: false,
    },
    {
      key: 'completed' as const,
      label: '完了',
      value: stats.completed,
      textColor: 'text-emerald-600',
      isHighlight: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {/* ステータスカード */}
      {cards.map((card) => (
        <button
          key={card.key}
          onClick={() => onStatusChange(card.key)}
          className={`p-4 rounded-xl border transition-all text-left ${
            currentStatus === card.key
              ? 'bg-white border-teal-300 ring-2 ring-teal-100 shadow-sm'
              : 'bg-white/60 border-gray-200 hover:bg-white hover:border-gray-300'
          }`}
        >
          <div className={`text-2xl font-bold ${card.textColor}`}>
            {card.value}
          </div>
          <div className="text-xs text-gray-500 mt-1">{card.label}</div>
        </button>
      ))}

      {/* 事業所未割当カード（クリック不可） */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60">
        <div className="text-2xl font-bold text-amber-700">
          {stats.unassignedOffice}
        </div>
        <div className="text-xs text-amber-600 mt-1">事業所未割当</div>
      </div>
    </div>
  );
}
