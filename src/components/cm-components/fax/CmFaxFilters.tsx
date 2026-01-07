// =============================================================
// src/components/cm-components/fax/CmFaxFilters.tsx
// FAX一覧 - フィルター
// =============================================================

'use client';

import React, { useState, useCallback } from 'react';
import { Search, X, User, Users, RefreshCw } from 'lucide-react';
import type { CmFaxFilters } from '@/types/cm/fax';

type Props = {
  filters: CmFaxFilters;
  loading: boolean;
  isFiltered: boolean;
  userName: string;
  onAssignmentChange: (value: 'mine' | 'all') => void;
  onSearch: (searchText: string) => void;
  onReset: () => void;
  onRefresh: () => void;
};

export function CmFaxFilters({
  filters,
  loading,
  isFiltered,
  userName,
  onAssignmentChange,
  onSearch,
  onReset,
  onRefresh,
}: Props) {
  const [searchText, setSearchText] = useState(filters.search);

  // 検索実行
  const handleSearchSubmit = useCallback(() => {
    onSearch(searchText);
  }, [searchText, onSearch]);

  // Enterキーで検索
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSearchSubmit();
      }
    },
    [handleSearchSubmit]
  );

  // 検索クリア
  const handleClearSearch = useCallback(() => {
    setSearchText('');
    onSearch('');
  }, [onSearch]);

  return (
    <div className="space-y-4">
      {/* ヘッダー行：タイトル + 担当切り替え + 更新ボタン */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-800">FAX受信一覧</h1>
          <span className="text-sm text-slate-500">
            {userName}さんの{filters.assignment === 'mine' ? '担当分' : '全件'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 担当切り替えボタン */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => onAssignmentChange('mine')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filters.assignment === 'mine'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <User className="w-4 h-4" />
              担当分
            </button>
            <button
              onClick={() => onAssignmentChange('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filters.assignment === 'all'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-4 h-4" />
              全件
            </button>
          </div>

          {/* 更新ボタン */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 担当分の説明バナー */}
      {filters.assignment === 'mine' && (
        <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200/60 rounded-xl">
          <p className="text-sm text-sky-900">
            <span className="font-semibold">{userName}</span>
            さんの担当利用者が利用している事業所からのFAXと、
            <span className="font-semibold text-amber-700">事業所が未割当のFAX</span>
            を表示しています
          </p>
          <p className="text-xs text-sky-600 mt-0.5">
            未割当FAXは担当分の可能性があるため全員に表示されます
          </p>
        </div>
      )}

      {/* 検索バー */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="事業所名、FAX番号で検索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-11 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all"
          />
          {searchText && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* フィルタークリアボタン */}
        {isFiltered && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <X className="w-4 h-4" />
            フィルターをクリア
          </button>
        )}
      </div>
    </div>
  );
}