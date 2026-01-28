// =============================================================
// src/app/cm-portal/fax/page.tsx
// FAX受信一覧画面
//
// 【修正】useSearchParams() の Suspense 対応
// Next.js 14以降では useSearchParams() を使用するコンポーネントは
// Suspense でラップする必要がある
// =============================================================

'use client';

import React, { Suspense } from 'react';
import { useCmFax } from '@/hooks/cm/fax/useCmFax';
import { useCmUser } from '@/hooks/cm/users/useCmUser';
import { CmFaxFilters } from '@/components/cm-components/fax/CmFaxFilters';
import { CmFaxStats } from '@/components/cm-components/fax/CmFaxStats';
import { CmFaxTable } from '@/components/cm-components/fax/CmFaxTable';

// =============================================================
// ローディングフォールバック
// =============================================================
function CmFaxListLoading() {
  return (
    <div className="space-y-6">
      {/* フィルターセクション スケルトン */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="h-10 bg-slate-100 rounded animate-pulse" />
      </div>

      {/* 統計カード スケルトン */}
      <div className="grid grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="h-8 w-16 bg-slate-100 rounded animate-pulse mb-2" />
            <div className="h-4 w-12 bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* テーブル スケルトン */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// FAX一覧コンテンツ（実際のコンポーネント）
// =============================================================
function CmFaxListContent() {
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

// =============================================================
// メインページコンポーネント
// =============================================================
export default function CmFaxListPage() {
  return (
    <Suspense fallback={<CmFaxListLoading />}>
      <CmFaxListContent />
    </Suspense>
  );
}