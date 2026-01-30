// =============================================================
// src/components/cm-components/rpa/CmRpaLogFilters.tsx
// RPAログ検索フィルター
// =============================================================

'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { CmDateTimeLocalInput } from '@/components/cm-components/common/CmDateTimeLocalInput';
import type { CmRpaLogFilters as CmRpaLogFiltersType } from '@/types/cm/rpaLogs';

type Props = {
  filters: CmRpaLogFiltersType;
  onFilterChange: (key: keyof CmRpaLogFiltersType, value: string) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function CmRpaLogFilters({
  filters,
  onFilterChange,
  onSearch,
  onReset,
}: Props) {
  return (
    <CmCard title="検索条件">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* 環境 */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            環境
          </label>
          <select
            value={filters.env}
            onChange={(e) => onFilterChange('env', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
          >
            <option value="">すべて</option>
            <option value="production">production</option>
            <option value="preview">preview</option>
            <option value="development">development</option>
          </select>
        </div>

        {/* レベル */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            レベル
          </label>
          <select
            value={filters.level}
            onChange={(e) => onFilterChange('level', e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
          >
            <option value="">すべて</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
            <option value="debug">debug</option>
          </select>
        </div>

        {/* モジュール */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            モジュール
          </label>
          <input
            type="text"
            value={filters.moduleName}
            onChange={(e) => onFilterChange('moduleName', e.target.value)}
            placeholder="例: kaipoke/scraper"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
          />
        </div>

        {/* メッセージ */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            メッセージ
          </label>
          <input
            type="text"
            value={filters.message}
            onChange={(e) => onFilterChange('message', e.target.value)}
            placeholder="キーワード検索"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
          />
        </div>

        {/* トレースID */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            トレースID
          </label>
          <input
            type="text"
            value={filters.traceId}
            onChange={(e) => onFilterChange('traceId', e.target.value)}
            placeholder="トレースIDで絞り込み"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
          />
        </div>

        {/* 開始日時 */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            開始日時
          </label>
          <CmDateTimeLocalInput
            value={filters.from}
            onChange={(utcValue) => onFilterChange('from', utcValue)}
          />
        </div>

        {/* 終了日時 */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            終了日時
          </label>
          <CmDateTimeLocalInput
            value={filters.to}
            onChange={(utcValue) => onFilterChange('to', utcValue)}
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