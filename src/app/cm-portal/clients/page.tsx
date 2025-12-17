// =============================================================
// src/app/cm-portal/clients/page.tsx
// 利用者情報一覧画面
// =============================================================

'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useCmClients } from '@/hooks/cm/useCmClients';
import { CmClientFilters } from '@/components/cm-components/clients/CmClientFilters';
import { CmClientTable } from '@/components/cm-components/clients/CmClientTable';

export default function CmClientsPage() {
  const {
    clients,
    pagination,
    loading,
    error,
    insurerOptions,
    filters,
    isFiltered,
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    refresh,
  } = useCmClients();

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">利用者情報一覧</h1>
          <p className="text-sm text-slate-500 mt-1">
            ケアマネジメント対象の利用者を管理します
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          更新
        </button>
      </div>

      {/* フィルター */}
      <CmClientFilters
        filters={filters}
        insurerOptions={insurerOptions}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* 件数表示 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">
            {pagination?.total ?? clients.length}
          </span>{' '}
          件
        </span>
        {isFiltered && (
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
            フィルター適用中
          </span>
        )}
      </div>

      {/* テーブル */}
      <CmClientTable
        clients={clients}
        pagination={pagination}
        loading={loading}
        error={error}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
