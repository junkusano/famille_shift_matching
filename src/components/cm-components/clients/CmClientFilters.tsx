// =============================================================
// src/components/cm-components/clients/CmClientFilters.tsx
// 利用者一覧 - 検索フィルター
// =============================================================

'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import type { CmClientFilters as CmClientFiltersType } from '@/types/cm/clients';

type Props = {
  filters: CmClientFiltersType;
  insurerOptions: string[];
  onFilterChange: (key: keyof CmClientFiltersType, value: string) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function CmClientFilters({
  filters,
  insurerOptions,
  onFilterChange,
  onSearch,
  onReset,
}: Props) {
  return (
    <CmCard title="検索条件">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* 利用者名検索 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            利用者名
          </label>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            placeholder="氏名・カナ・ふりがなで検索"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* ステータス */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            利用者状態
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">すべて</option>
            <option value="active">利用中</option>
            <option value="inactive">利用停止</option>
          </select>
        </div>

        {/* 保険者 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            保険者
          </label>
          <select
            value={filters.insurer}
            onChange={(e) => onFilterChange('insurer', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">すべて</option>
            {insurerOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* ボタン */}
        <div className="flex items-end gap-2">
          <button
            onClick={onSearch}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900"
          >
            <Search className="w-4 h-4" />
            検索
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            リセット
          </button>
        </div>
      </div>
    </CmCard>
  );
}