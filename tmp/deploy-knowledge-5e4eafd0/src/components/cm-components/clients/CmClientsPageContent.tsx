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
import styles from '@/styles/cm-styles/clients/clientsPage.module.css';

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
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>利用者情報一覧</h1>
          <p className={styles.pageDescription}>
            ケアマネジメント対象の利用者を管理します
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isPending}
          className={styles.refreshButton}
        >
          <RefreshCw className={isPending ? styles.refreshIconSpin : styles.refreshIcon} />
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
      <div className={styles.countRow}>
        <span className={styles.countText}>
          <span className={styles.countNumber}>{pagination.total}</span> 件
        </span>
        {isFiltered && (
          <span className={styles.filterBadge}>フィルター適用中</span>
        )}
        {isPending && (
          <span className={styles.loadingBadge}>読み込み中...</span>
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
