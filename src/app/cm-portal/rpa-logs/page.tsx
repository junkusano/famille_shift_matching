// =============================================================
// src/app/cm-portal/rpa-logs/page.tsx
// RPAログ管理画面
// =============================================================

'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useCmRpaLogs } from '@/hooks/cm/rpa/useCmRpaLogs';
import { CmRpaLogFilters } from '@/components/cm-components/rpa/CmRpaLogFilters';
import { CmRpaLogTable } from '@/components/cm-components/rpa/CmRpaLogTable';

export default function CmRpaLogsPage() {
  const {
    logs,
    pagination,
    loading,
    error,
    filters,
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    refresh,
  } = useCmRpaLogs();

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            RPAログ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            RPA実行ログを確認できます
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          更新
        </button>
      </div>

      {/* フィルター */}
      <CmRpaLogFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* テーブル */}
      <CmRpaLogTable
        logs={logs}
        pagination={pagination}
        loading={loading}
        error={error}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
