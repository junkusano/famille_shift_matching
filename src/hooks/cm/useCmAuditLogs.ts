// =============================================================
// src/hooks/cm/useCmAuditLogs.ts
// システムログの状態管理・API呼び出し
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  CmLogEntry,
  CmAuditLogPagination,
  CmAuditLogFilters,
  CmAuditLogsApiResponse,
} from '@/types/cm/auditLogs';
import { CM_AUDIT_LOG_DEFAULT_FILTERS } from '@/types/cm/auditLogs';

export function useCmAuditLogs() {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [logs, setLogs] = useState<CmLogEntry[]>([]);
  const [pagination, setPagination] = useState<CmAuditLogPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CmAuditLogFilters>(CM_AUDIT_LOG_DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  // ---------------------------------------------------------
  // API 呼び出し
  // ---------------------------------------------------------
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (filters.env) params.set('env', filters.env);
      if (filters.level) params.set('level', filters.level);
      if (filters.moduleName) params.set('module', filters.moduleName);
      if (filters.message) params.set('message', filters.message);
      if (filters.traceId) params.set('traceId', filters.traceId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const res = await fetch(`/api/cm/audit/logs?${params.toString()}`, {
        credentials: 'include',
      });

      const data: CmAuditLogsApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setLogs([]);
        setPagination(null);
        return;
      }

      setLogs(data.logs || []);
      setPagination(data.pagination || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setLogs([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // ---------------------------------------------------------
  // 初回読み込み & 依存変更時
  // ---------------------------------------------------------
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleFilterChange = useCallback(
    (key: keyof CmAuditLogFilters, value: string) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    []
  );

  const handleSearch = useCallback(() => {
    setPage(1);
    fetchLogs();
  }, [fetchLogs]);

  const handleReset = useCallback(() => {
    setFilters(CM_AUDIT_LOG_DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // ---------------------------------------------------------
  // 計算値
  // ---------------------------------------------------------
  const isFiltered =
    filters.env !== '' ||
    filters.level !== '' ||
    filters.moduleName !== '' ||
    filters.message !== '' ||
    filters.traceId !== '' ||
    filters.from !== '' ||
    filters.to !== '';

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    logs,
    pagination,
    loading,
    error,

    // フィルター
    filters,
    isFiltered,

    // ハンドラー
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    refresh: fetchLogs,
  };
}