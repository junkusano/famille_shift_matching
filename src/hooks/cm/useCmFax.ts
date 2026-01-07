// =============================================================
// src/hooks/cm/useCmFax.ts
// FAX一覧のデータ取得・状態管理フック
// =============================================================

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type {
  CmFaxReceived,
  CmFaxStats,
  CmFaxPagination,
  CmFaxFilters,
  CmFaxSortConfig,
  CmFaxListApiResponse,
} from '@/types/cm/fax';

// =============================================================
// デフォルト値
// =============================================================

const DEFAULT_FILTERS: CmFaxFilters = {
  assignment: 'mine',
  status: 'all',
  search: '',
};

const DEFAULT_SORT: CmFaxSortConfig = {
  key: 'receivedAt',
  direction: 'desc',
};

// =============================================================
// Hook
// =============================================================

export function useCmFax() {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [faxList, setFaxList] = useState<CmFaxReceived[]>([]);
  const [stats, setStats] = useState<CmFaxStats | null>(null);
  const [pagination, setPagination] = useState<CmFaxPagination | null>(null);
  const [myAssignedOfficeIds, setMyAssignedOfficeIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CmFaxFilters>(DEFAULT_FILTERS);
  const [sortConfig, setSortConfig] = useState<CmFaxSortConfig>(DEFAULT_SORT);
  const [page, setPage] = useState(1);

  // ---------------------------------------------------------
  // フィルター適用中かどうか
  // ---------------------------------------------------------
  const isFiltered = useMemo(() => {
    return (
      filters.status !== 'all' ||
      filters.search !== '' ||
      filters.assignment !== 'mine'
    );
  }, [filters]);

  // ---------------------------------------------------------
  // API 呼び出し
  // ---------------------------------------------------------
  const fetchFaxList = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('assignment', filters.assignment);
      params.set('status', filters.status);
      params.set('sortKey', sortConfig.key);
      params.set('sortDir', sortConfig.direction);

      if (filters.search) {
        params.set('search', filters.search);
      }

      const res = await fetch(`/api/cm/fax?${params.toString()}`, {
        credentials: 'include',
      });

      const data: CmFaxListApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setFaxList([]);
        setStats(null);
        setPagination(null);
        return;
      }

      setFaxList(data.faxList || []);
      setStats(data.stats || null);
      setPagination(data.pagination || null);
      
      if (data.myAssignedOfficeIds) {
        setMyAssignedOfficeIds(data.myAssignedOfficeIds);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラーが発生しました');
      setFaxList([]);
      setStats(null);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters, sortConfig]);

  // ---------------------------------------------------------
  // 初回読み込み & フィルター変更時
  // ---------------------------------------------------------
  useEffect(() => {
    fetchFaxList();
  }, [fetchFaxList]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------

  /** フィルター変更 */
  const handleFilterChange = useCallback(
    (key: keyof CmFaxFilters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1); // フィルター変更時はページをリセット
    },
    []
  );

  /** 検索実行 */
  const handleSearch = useCallback((searchText: string) => {
    setFilters((prev) => ({ ...prev, search: searchText }));
    setPage(1);
  }, []);

  /** フィルターリセット */
  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSortConfig(DEFAULT_SORT);
    setPage(1);
  }, []);

  /** ページ変更 */
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  /** ソート変更 */
  const handleSort = useCallback((key: CmFaxSortConfig['key']) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  }, []);

  /** 担当切り替え */
  const handleAssignmentChange = useCallback((value: 'mine' | 'all') => {
    setFilters((prev) => ({ ...prev, assignment: value }));
    setPage(1);
  }, []);

  /** ステータス切り替え */
  const handleStatusChange = useCallback((value: CmFaxFilters['status']) => {
    setFilters((prev) => ({ ...prev, status: value }));
    setPage(1);
  }, []);

  /** リフレッシュ */
  const refresh = useCallback(() => {
    fetchFaxList();
  }, [fetchFaxList]);

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    faxList,
    stats,
    pagination,
    myAssignedOfficeIds,
    
    // 状態
    loading,
    error,
    filters,
    sortConfig,
    isFiltered,
    
    // ハンドラー
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    handleSort,
    handleAssignmentChange,
    handleStatusChange,
    refresh,
  };
}
