// =============================================================
// src/hooks/cm/useCmOtherOffices.ts
// 他社事業所一覧のデータ取得・状態管理フック
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  CmOtherOffice,
  CmOtherOfficePagination,
  CmOtherOfficeFilters,
  CmOtherOfficesApiResponse,
  CmOtherOfficeUpdateResponse,
} from '@/types/cm/otherOffices';
import { CM_OTHER_OFFICE_DEFAULT_FILTERS } from '@/types/cm/otherOffices';

export function useCmOtherOffices() {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [offices, setOffices] = useState<CmOtherOffice[]>([]);
  const [pagination, setPagination] = useState<CmOtherOfficePagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceTypeOptions, setServiceTypeOptions] = useState<string[]>([]);
  const [filters, setFilters] = useState<CmOtherOfficeFilters>(CM_OTHER_OFFICE_DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  // FAX代行番号更新中のID
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // ---------------------------------------------------------
  // API 呼び出し - 一覧取得
  // ---------------------------------------------------------
  const fetchOffices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (filters.serviceType) params.set('serviceType', filters.serviceType);
      if (filters.officeName) params.set('officeName', filters.officeName);
      if (filters.officeNumber) params.set('officeNumber', filters.officeNumber);
      if (filters.faxNumber) params.set('faxNumber', filters.faxNumber);

      const res = await fetch(`/api/cm/other-offices?${params.toString()}`, {
        credentials: 'include',
      });

      const data: CmOtherOfficesApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setOffices([]);
        setPagination(null);
        return;
      }

      setOffices(data.offices || []);
      setPagination(data.pagination || null);

      // サービス種別オプションの更新（初回または空の場合のみ）
      if (data.serviceTypes && data.serviceTypes.length > 0) {
        setServiceTypeOptions(data.serviceTypes);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setOffices([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // ---------------------------------------------------------
  // API 呼び出し - FAX代行番号更新
  // ---------------------------------------------------------
  const updateFaxProxy = useCallback(async (
    id: number,
    faxProxy: string | null
  ): Promise<boolean> => {
    setUpdatingId(id);
    setUpdateError(null);

    try {
      const res = await fetch(`/api/cm/other-offices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fax_proxy: faxProxy }),
      });

      const data: CmOtherOfficeUpdateResponse = await res.json();

      if (!data.ok) {
        setUpdateError(data.error || '更新に失敗しました');
        return false;
      }

      // ローカルステートを更新
      if (data.office) {
        setOffices((prev) =>
          prev.map((office) =>
            office.id === id ? { ...office, fax_proxy: data.office!.fax_proxy } : office
          )
        );
      }

      return true;
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : '通信エラー');
      return false;
    } finally {
      setUpdatingId(null);
    }
  }, []);

  // ---------------------------------------------------------
  // 初回読み込み & フィルター/ページ変更時
  // ---------------------------------------------------------
  useEffect(() => {
    fetchOffices();
  }, [fetchOffices]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleFilterChange = useCallback((key: keyof CmOtherOfficeFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
    fetchOffices();
  }, [fetchOffices]);

  const handleReset = useCallback(() => {
    setFilters(CM_OTHER_OFFICE_DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const clearUpdateError = useCallback(() => {
    setUpdateError(null);
  }, []);

  // ---------------------------------------------------------
  // 計算値
  // ---------------------------------------------------------
  const isFiltered =
    filters.serviceType !== '' ||
    filters.officeName !== '' ||
    filters.officeNumber !== '' ||
    filters.faxNumber !== '';

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    offices,
    pagination,
    loading,
    error,
    serviceTypeOptions,

    // フィルター
    filters,
    isFiltered,

    // 更新状態
    updatingId,
    updateError,

    // ハンドラー
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    refresh: fetchOffices,
    updateFaxProxy,
    clearUpdateError,
  };
}