// =============================================================
// src/components/cm-components/other-offices/CmOtherOfficeFilters.tsx
// 他社事業所一覧 - 検索フィルター
// =============================================================

'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import type { CmOtherOfficeFilters as CmOtherOfficeFiltersType } from '@/types/cm/otherOffices';

type Props = {
  filters: CmOtherOfficeFiltersType;
  serviceTypeOptions: string[];
  onFilterChange: (key: keyof CmOtherOfficeFiltersType, value: string) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function CmOtherOfficeFilters({
  filters,
  serviceTypeOptions,
  onFilterChange,
  onSearch,
  onReset,
}: Props) {
  // Enterキーで検索実行
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <CmCard title="検索条件">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* サービス種別 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            サービス種別
          </label>
          <select
            value={filters.serviceType}
            onChange={(e) => onFilterChange('serviceType', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            <option value="">すべて</option>
            {serviceTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* 事業所名 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            事業所名
          </label>
          <input
            type="text"
            value={filters.officeName}
            onChange={(e) => onFilterChange('officeName', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="事業所名で検索"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        {/* 事業者番号 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            事業者番号
          </label>
          <input
            type="text"
            value={filters.officeNumber}
            onChange={(e) => onFilterChange('officeNumber', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="事業者番号で検索"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        {/* FAX番号 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            FAX番号
          </label>
          <input
            type="text"
            value={filters.faxNumber}
            onChange={(e) => onFilterChange('faxNumber', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="FAX / FAX代行で検索"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        {/* ボタン */}
        <div className="flex items-end gap-2">
          <button
            onClick={onSearch}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-sm font-medium"
          >
            <Search className="w-4 h-4" />
            検索
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            リセット
          </button>
        </div>
      </div>
    </CmCard>
  );
}