// =============================================================
// src/components/cm-components/clients/CmClientsPageContent.tsx
// 利用者情報一覧のClient Component（フィルター・テーブル）
// =============================================================

'use client';

import React, { useCallback, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { CmClientFilters } from '@/components/cm-components/clients/CmClientFilters';
import { CmClientTable } from '@/components/cm-components/clients/CmClientTable';
import type { CmClientInfo, CmPagination, CmClientFilters as CmClientFiltersType } from '@/types/cm/clients';

type Props = {
  clients: CmClientInfo[];
  pagination: CmPagination;
  insurerOptions: string[];
  initialFilters: {
    search: string;
    status: string;
    insurer: string;
  };
};

export function CmClientsPageContent({
  clients,
  pagination,
  insurerOptions,
  initialFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ローカルのフィルター状態（入力中の値を保持）
  const [filters, setFilters] = useState<CmClientFiltersType>(initialFilters);

  // URLを更新してServer Componentを再レンダリング
  const updateUrl = useCallback((newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(newParams).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // ページをリセット（フィルター変更時）
    if (!('page' in newParams)) {
      params.set('page', '1');
    }

    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }, [router, searchParams]);

  // フィルター変更（ローカル状態のみ更新）
  const handleFilterChange = useCallback((key: keyof CmClientFiltersType, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 検索実行
  const handleSearch = useCallback(() => {
    updateUrl({
      search: filters.search,
      status: filters.status,
      insurer: filters.insurer,
    });
  }, [filters, updateUrl]);

  // リセット
  const handleReset = useCallback(() => {
    const defaultFilters = { search: '', status: 'active', insurer: '' };
    setFilters(defaultFilters);
    updateUrl(defaultFilters);
  }, [updateUrl]);

  // ページ変更
  const handlePageChange = useCallback((newPage: number) => {
    updateUrl({ page: String(newPage) });
  }, [updateUrl]);

  // 更新（現在のURLで再取得）
  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // フィルター適用中かどうか
  const isFiltered =
    filters.search !== '' ||
    filters.status !== 'active' ||
    filters.insurer !== '';

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
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
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
            {pagination.total}
          </span>{' '}
          件
        </span>
        {isFiltered && (
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
            フィルター適用中
          </span>
        )}
        {isPending && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium">
            読み込み中...
          </span>
        )}
      </div>

      {/* テーブル */}
      <CmClientTable
        clients={clients}
        pagination={pagination}
        loading={isPending}
        error={null}
        onPageChange={handlePageChange}
      />
    </div>
  );
}