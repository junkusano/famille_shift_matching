// =============================================================
// src/app/cm-portal/audit/logs/page.tsx
// システムログ管理画面
// =============================================================

'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useCmAuditLogs } from '@/hooks/cm/useCmAuditLogs';
import { CmAuditLogFilters } from '@/components/cm-components/audit/CmAuditLogFilters';
import { CmAuditLogTable } from '@/components/cm-components/audit/CmAuditLogTable';

export default function CmAuditLogsPage() {
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
  } = useCmAuditLogs();

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            システムログ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            warn / error レベルのログを確認できます
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
      <CmAuditLogFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* テーブル */}
      <CmAuditLogTable
        logs={logs}
        pagination={pagination}
        loading={loading}
        error={error}
        onPageChange={handlePageChange}
      />
    </div>
  );
}