// =============================================================
// src/app/cm-portal/fax/page.tsx
// FAX受信一覧画面
// =============================================================

'use client';

import React from 'react';
import { useCmFax } from '@/hooks/cm/useCmFax';
import { useCmUser } from '@/hooks/cm/useCmUser';
import { CmFaxFilters } from '@/components/cm-components/fax/CmFaxFilters';
import { CmFaxStats } from '@/components/cm-components/fax/CmFaxStats';
import { CmFaxTable } from '@/components/cm-components/fax/CmFaxTable';

export default function CmFaxListPage() {
  // ユーザー情報
  const { user } = useCmUser();
  const userName = user?.displayName || 'ユーザー';

  // FAXデータ
  const {
    faxList,
    stats,
    pagination,
    myAssignedOfficeIds,
    loading,
    error,
    filters,
    sortConfig,
    isFiltered,
    handleSearch,
    handleReset,
    handlePageChange,
    handleSort,
    handleAssignmentChange,
    handleStatusChange,
    refresh,
  } = useCmFax();

  return (
    <div className="space-y-6">
      {/* フィルターセクション */}
      <CmFaxFilters
        filters={filters}
        loading={loading}
        isFiltered={isFiltered}
        userName={userName}
        onAssignmentChange={handleAssignmentChange}
        onSearch={handleSearch}
        onReset={handleReset}
        onRefresh={refresh}
      />

      {/* 統計カード */}
      <CmFaxStats
        stats={stats}
        currentStatus={filters.status}
        onStatusChange={handleStatusChange}
      />

      {/* 件数表示 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">
            {pagination?.total ?? faxList.length}
          </span>{' '}
          件
        </span>
        {isFiltered && (
          <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded font-medium">
            フィルター適用中
          </span>
        )}
      </div>

      {/* FAXテーブル */}
      <CmFaxTable
        faxList={faxList}
        myAssignedOfficeIds={myAssignedOfficeIds}
        pagination={pagination}
        sortConfig={sortConfig}
        loading={loading}
        error={error}
        onPageChange={handlePageChange}
        onSort={handleSort}
      />

      {/* フッター */}
      <div className="text-center text-xs text-gray-400">
        <p>FAX受信件数は月間900件までの制限があります</p>
      </div>
    </div>
  );
}
