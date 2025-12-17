// =============================================================
// src/hooks/cm/useCmClients.ts
// 利用者一覧のデータ取得・状態管理フック
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  CmClientInfo,
  CmPagination,
  CmClientFilters,
  CmClientsApiResponse,
} from '@/types/cm/clients';

const DEFAULT_FILTERS: CmClientFilters = {
  search: '',
  status: 'active',
  insurer: '',
};

export function useCmClients() {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [clients, setClients] = useState<CmClientInfo[]>([]);
  const [pagination, setPagination] = useState<CmPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insurerOptions, setInsurerOptions] = useState<string[]>([]);
  const [filters, setFilters] = useState<CmClientFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  // ---------------------------------------------------------
  // API 呼び出し
  // ---------------------------------------------------------
  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      if (filters.insurer) params.set('insurer', filters.insurer);

      const res = await fetch(`/api/cm/clients?${params.toString()}`, {
        credentials: 'include',
      });

      const data: CmClientsApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setClients([]);
        setPagination(null);
        return;
      }

      setClients(data.clients || []);
      setPagination(data.pagination || null);

      if (data.insurerOptions && data.insurerOptions.length > 0) {
        setInsurerOptions(data.insurerOptions);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setClients([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // ---------------------------------------------------------
  // 初回読み込み & フィルター/ページ変更時
  // ---------------------------------------------------------
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleFilterChange = useCallback((key: keyof CmClientFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
    fetchClients();
  }, [fetchClients]);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // ---------------------------------------------------------
  // 計算値
  // ---------------------------------------------------------
  const isFiltered =
    filters.search !== '' ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.insurer !== '';

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    clients,
    pagination,
    loading,
    error,
    insurerOptions,

    // フィルター
    filters,
    isFiltered,

    // ハンドラー
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    refresh: fetchClients,
  };
}