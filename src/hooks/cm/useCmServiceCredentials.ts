// =============================================================
// src/hooks/cm/useCmServiceCredentials.ts
// サービス認証情報のデータ取得・状態管理フック
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  CmServiceCredential,
  CmServiceCredentialMasked,
} from '@/types/cm/serviceCredentials';

// フィルター型
export type CmServiceCredentialsFilters = {
  serviceName: string;
  showInactive: boolean;
};

// デフォルトフィルター
const DEFAULT_FILTERS: CmServiceCredentialsFilters = {
  serviceName: '',
  showInactive: false,
};

// API レスポンス型
type FetchEntriesResponse = {
  ok: boolean;
  entries?: CmServiceCredentialMasked[];
  error?: string;
};

type FetchEntryResponse = {
  ok: boolean;
  entry?: CmServiceCredential;
  error?: string;
};

type CreateEntryResponse = {
  ok: boolean;
  entry?: CmServiceCredential;
  error?: string;
};

type UpdateEntryResponse = {
  ok: boolean;
  entry?: CmServiceCredential;
  error?: string;
};

type DeleteEntryResponse = {
  ok: boolean;
  deletedId?: number;
  error?: string;
};

export function useCmServiceCredentials() {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [entries, setEntries] = useState<CmServiceCredentialMasked[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CmServiceCredentialsFilters>(DEFAULT_FILTERS);

  // 更新状態
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // ---------------------------------------------------------
  // API 呼び出し - 一覧取得
  // ---------------------------------------------------------
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (filters.serviceName) params.set('serviceName', filters.serviceName);
      if (filters.showInactive) params.set('showInactive', 'true');

      const res = await fetch(`/api/cm/service-credentials?${params.toString()}`, {
        credentials: 'include',
      });

      const data: FetchEntriesResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setEntries([]);
        return;
      }

      setEntries(data.entries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // ---------------------------------------------------------
  // API 呼び出し - 個別取得（編集用、認証情報を含む）
  // ---------------------------------------------------------
  const fetchEntry = useCallback(async (id: number): Promise<CmServiceCredential | null> => {
    try {
      const res = await fetch(`/api/cm/service-credentials/${id}`, {
        credentials: 'include',
      });

      const data: FetchEntryResponse = await res.json();

      if (!data.ok || !data.entry) {
        setUpdateError(data.error || 'データ取得に失敗しました');
        return null;
      }

      return data.entry;
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : '通信エラー');
      return null;
    }
  }, []);

  // ---------------------------------------------------------
  // API 呼び出し - 新規作成
  // ---------------------------------------------------------
  const createEntry = useCallback(async (
    data: {
      service_name: string;
      label?: string | null;
      credentials: Record<string, unknown>;
      is_active?: boolean;
    }
  ): Promise<{ ok: boolean; entry?: CmServiceCredential; error?: string }> => {
    try {
      const res = await fetch('/api/cm/service-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const result: CreateEntryResponse = await res.json();

      if (!result.ok) {
        return { ok: false, error: result.error || '作成に失敗しました' };
      }

      // 一覧を再取得
      await fetchEntries();

      return { ok: true, entry: result.entry };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '通信エラー' };
    }
  }, [fetchEntries]);

  // ---------------------------------------------------------
  // API 呼び出し - 更新
  // ---------------------------------------------------------
  const updateEntry = useCallback(async (
    id: number,
    data: {
      service_name?: string;
      label?: string | null;
      credentials?: Record<string, unknown>;
      is_active?: boolean;
    }
  ): Promise<boolean> => {
    setUpdatingId(id);
    setUpdateError(null);

    try {
      const res = await fetch(`/api/cm/service-credentials/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const result: UpdateEntryResponse = await res.json();

      if (!result.ok) {
        setUpdateError(result.error || '更新に失敗しました');
        return false;
      }

      // 一覧を再取得
      await fetchEntries();

      return true;
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : '通信エラー');
      return false;
    } finally {
      setUpdatingId(null);
    }
  }, [fetchEntries]);

  // ---------------------------------------------------------
  // API 呼び出し - 削除
  // ---------------------------------------------------------
  const deleteEntry = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/cm/service-credentials/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const result: DeleteEntryResponse = await res.json();

      if (!result.ok) {
        setUpdateError(result.error || '削除に失敗しました');
        return false;
      }

      // ローカルステートから削除
      setEntries((prev) => prev.filter((entry) => entry.id !== id));

      return true;
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : '通信エラー');
      return false;
    }
  }, []);

  // ---------------------------------------------------------
  // 初回読み込み & フィルター変更時
  // ---------------------------------------------------------
  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleFilterChange = useCallback((key: keyof CmServiceCredentialsFilters, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSearch = useCallback(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const clearUpdateError = useCallback(() => {
    setUpdateError(null);
  }, []);

  // ---------------------------------------------------------
  // 計算値
  // ---------------------------------------------------------
  const isFiltered = filters.serviceName !== '' || filters.showInactive !== false;

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    entries,
    loading,
    error,

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
    refresh: fetchEntries,
    clearUpdateError,

    // CRUD操作
    fetchEntry,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}
