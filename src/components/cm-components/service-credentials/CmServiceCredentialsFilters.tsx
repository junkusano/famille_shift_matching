// =============================================================
// src/components/cm-components/service-credentials/CmServiceCredentialsFilters.tsx
// サービス認証情報 - 検索フィルター
// =============================================================

'use client';

import React from 'react';
import { Search, RotateCcw } from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import type { CmServiceCredentialsFilters } from '@/hooks/cm/useCmServiceCredentials';

type Props = {
  filters: CmServiceCredentialsFilters;
  onFilterChange: (key: keyof CmServiceCredentialsFilters, value: string | boolean) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function CmServiceCredentialsFilters({
  filters,
  onFilterChange,
  onSearch,
  onReset,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <CmCard title="検索条件">
      <div className="flex flex-wrap items-end gap-4">
        {/* サービス名 */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            サービス名
          </label>
          <input
            type="text"
            value={filters.serviceName}
            onChange={(e) => onFilterChange('serviceName', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="サービス名で検索"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        {/* ステータス */}
        <div className="min-w-[140px]">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            ステータス
          </label>
          <select
            value={filters.showInactive ? 'all' : 'active'}
            onChange={(e) => onFilterChange('showInactive', e.target.value === 'all')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="active">有効のみ</option>
            <option value="all">すべて</option>
          </select>
        </div>

        {/* ボタン */}
        <div className="flex items-center gap-2">
          <button
            onClick={onSearch}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
          >
            <Search className="w-4 h-4" />
            検索
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            リセット
          </button>
        </div>
      </div>
    </CmCard>
  );
}
