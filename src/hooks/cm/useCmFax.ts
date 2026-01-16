// =============================================================
// src/hooks/cm/useCmFax.ts
// FAX一覧用カスタムフック
//
// 【最適化】
// - ページ番号をURLクエリパラメータで管理
// - 統計を別APIから並列取得（高速化）
// - unassignedOffice フィルターを追加
// =============================================================

'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
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
  // Router / URL
  // ---------------------------------------------------------
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ---------------------------------------------------------
  // URLからページ番号を取得（デフォルト: 1）
  // ---------------------------------------------------------
  const pageFromUrl = useMemo(() => {
    const pageParam = searchParams.get('page');
    const parsed = pageParam ? parseInt(pageParam, 10) : 1;
    return isNaN(parsed) || parsed < 1 ? 1 : parsed;
  }, [searchParams]);

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

  // 統計キャッシュ用（フィルター条件が変わった時のみ再取得）
  const statsFilterRef = useRef<string>('');

  // ページ番号はURLから取得
  const page = pageFromUrl;

  // ---------------------------------------------------------
  // URLのクエリパラメータを更新するヘルパー
  // ---------------------------------------------------------
  const updateUrlParams = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newPage === 1) {
        params.delete('page'); // ページ1の場合はパラメータを削除
      } else {
        params.set('page', String(newPage));
      }
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams]
  );

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
  // 統計API呼び出し（別APIで高速化）
  // ---------------------------------------------------------
  const fetchStats = useCallback(async () => {
    const filterKey = `${filters.assignment}-${filters.search}`;
    
    // 同じフィルター条件なら再取得しない
    if (statsFilterRef.current === filterKey && stats !== null) {
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set('assignment', filters.assignment);
      if (filters.search) {
        params.set('search', filters.search);
      }

      const res = await fetch(`/api/cm/fax/stats?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (data.ok) {
        setStats(data.stats);
        statsFilterRef.current = filterKey;
      }
    } catch {
      // 統計取得失敗は無視（一覧は表示可能）
    }
  }, [filters.assignment, filters.search, stats]);

  // ---------------------------------------------------------
  // 一覧API呼び出し
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
        setPagination(null);
        return;
      }

      setFaxList(data.faxList || []);
      setPagination(data.pagination || null);
      
      if (data.myAssignedOfficeIds) {
        setMyAssignedOfficeIds(data.myAssignedOfficeIds);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラーが発生しました');
      setFaxList([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters, sortConfig]);

  // ---------------------------------------------------------
  // 初回読み込み & フィルター変更時（並列取得）
  // ---------------------------------------------------------
  useEffect(() => {
    // 一覧と統計を並列で取得
    Promise.all([fetchFaxList(), fetchStats()]);
  }, [fetchFaxList, fetchStats]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------

  /** フィルター変更 */
  const handleFilterChange = useCallback(
    (key: keyof CmFaxFilters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      updateUrlParams(1); // フィルター変更時はページをリセット
    },
    [updateUrlParams]
  );

  /** 検索実行 */
  const handleSearch = useCallback((searchText: string) => {
    setFilters((prev) => ({ ...prev, search: searchText }));
    updateUrlParams(1);
  }, [updateUrlParams]);

  /** フィルターリセット */
  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSortConfig(DEFAULT_SORT);
    updateUrlParams(1);
  }, [updateUrlParams]);

  /** ページ変更 */
  const handlePageChange = useCallback((newPage: number) => {
    updateUrlParams(newPage);
  }, [updateUrlParams]);

  /** ソート変更 */
  const handleSort = useCallback((key: CmFaxSortConfig['key']) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
    updateUrlParams(1);
  }, [updateUrlParams]);

  /** 担当切り替え */
  const handleAssignmentChange = useCallback((value: 'mine' | 'all') => {
    setFilters((prev) => ({ ...prev, assignment: value }));
    updateUrlParams(1);
  }, [updateUrlParams]);

  /** ステータス切り替え（unassignedOffice対応） */
  const handleStatusChange = useCallback((value: CmFaxFilters['status']) => {
    setFilters((prev) => ({ ...prev, status: value }));
    updateUrlParams(1);
  }, [updateUrlParams]);

  /** リフレッシュ（統計キャッシュもクリア） */
  const refresh = useCallback(() => {
    statsFilterRef.current = ''; // 統計キャッシュをクリア
    Promise.all([fetchFaxList(), fetchStats()]);
  }, [fetchFaxList, fetchStats]);

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