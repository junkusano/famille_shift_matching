// =============================================================
// src/app/cm-portal/other-offices/page.tsx
// 他社事業所一覧画面
// =============================================================

'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useCmOtherOffices } from '@/hooks/cm/useCmOtherOffices';
import { CmOtherOfficeFilters } from '@/components/cm-components/other-offices/CmOtherOfficeFilters';
import { CmOtherOfficeTable } from '@/components/cm-components/other-offices/CmOtherOfficeTable';

export default function CmOtherOfficesPage() {
  const {
    offices,
    pagination,
    loading,
    error,
    serviceTypeOptions,
    filters,
    isFiltered,
    updatingId,
    updateError,
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    refresh,
    updateFaxProxy,
    clearUpdateError,
  } = useCmOtherOffices();

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            他社事業所一覧
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            カイポケから取得した他社事業所情報を管理します
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
      <CmOtherOfficeFilters
        filters={filters}
        serviceTypeOptions={serviceTypeOptions}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* 件数表示 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">
            {pagination?.total.toLocaleString() ?? offices.length}
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
      <CmOtherOfficeTable
        offices={offices}
        pagination={pagination}
        loading={loading}
        error={error}
        updatingId={updatingId}
        updateError={updateError}
        onPageChange={handlePageChange}
        onUpdateFaxProxy={updateFaxProxy}
        onClearUpdateError={clearUpdateError}
      />
    </div>
  );
}