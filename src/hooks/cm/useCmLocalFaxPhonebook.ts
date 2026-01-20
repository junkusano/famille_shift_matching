// =============================================================
// src/hooks/cm/useCmLocalFaxPhonebook.ts
// ローカルFAX電話帳のデータ取得・状態管理フック
// =============================================================

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  CmLocalFaxPhonebookEntry,
  CmLocalFaxPhonebookPagination,
  CmLocalFaxPhonebookSyncResult,
  CmKaipokeOfficeInfo,
  CmLocalFaxPhonebookEntryWithKaipoke,
} from '@/types/cm/localFaxPhonebook';

// フィルター型
export type CmLocalFaxPhonebookFilters = {
  name: string;
  faxNumber: string;
  showInactive: boolean;
};

// デフォルトフィルター
const DEFAULT_FILTERS: CmLocalFaxPhonebookFilters = {
  name: '',
  faxNumber: '',
  showInactive: false,
};

// API レスポンス型
type FetchEntriesResponse = {
  ok: boolean;
  entries?: CmLocalFaxPhonebookEntryWithKaipoke[];
  pagination?: CmLocalFaxPhonebookPagination;
  error?: string;
};

type CreateEntryResponse = {
  ok: boolean;
  entry?: CmLocalFaxPhonebookEntry;
  error?: string;
};

type UpdateEntryResponse = {
  ok: boolean;
  entry?: CmLocalFaxPhonebookEntry;
  error?: string;
};

type DeleteEntryResponse = {
  ok: boolean;
  deletedId?: number;
  error?: string;
};

type SyncResponse = {
  ok: boolean;
  summary?: CmLocalFaxPhonebookSyncResult['summary'];
  log?: string[];
  error?: string;
};

type KaipokeCheckResponse = {
  ok: boolean;
  offices?: CmKaipokeOfficeInfo[];
  error?: string;
};

export function useCmLocalFaxPhonebook() {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [entries, setEntries] = useState<CmLocalFaxPhonebookEntryWithKaipoke[]>([]);
  const [pagination, setPagination] = useState<CmLocalFaxPhonebookPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CmLocalFaxPhonebookFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  // 更新中のID
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // 同期状態
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<CmLocalFaxPhonebookSyncResult | null>(null);

  // カイポケチェック状態
  const [checkingKaipoke, setCheckingKaipoke] = useState(false);
  const [kaipokeCheckResult, setKaipokeCheckResult] = useState<CmKaipokeOfficeInfo[]>([]);
  const kaipokeCheckDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ---------------------------------------------------------
  // API 呼び出し - 一覧取得
  // ---------------------------------------------------------
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (filters.name) params.set('name', filters.name);
      if (filters.faxNumber) params.set('faxNumber', filters.faxNumber);
      if (filters.showInactive) params.set('showInactive', 'true');

      const res = await fetch(`/api/cm/local-fax-phonebook?${params.toString()}`, {
        credentials: 'include',
      });

      const data: FetchEntriesResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setEntries([]);
        setPagination(null);
        return;
      }

      setEntries(data.entries || []);
      setPagination(data.pagination || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setEntries([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // ---------------------------------------------------------
  // API 呼び出し - カイポケ登録チェック
  // ---------------------------------------------------------
  const checkKaipoke = useCallback(async (faxNumber: string): Promise<CmKaipokeOfficeInfo[]> => {
    if (!faxNumber || faxNumber.replace(/[^0-9]/g, '').length < 4) {
      setKaipokeCheckResult([]);
      return [];
    }

    setCheckingKaipoke(true);

    try {
      const params = new URLSearchParams();
      params.set('faxNumber', faxNumber);

      const res = await fetch(`/api/cm/local-fax-phonebook/check-kaipoke?${params.toString()}`, {
        credentials: 'include',
      });

      const data: KaipokeCheckResponse = await res.json();

      if (!data.ok) {
        setKaipokeCheckResult([]);
        return [];
      }

      const offices = data.offices || [];
      setKaipokeCheckResult(offices);
      return offices;
    } catch {
      setKaipokeCheckResult([]);
      return [];
    } finally {
      setCheckingKaipoke(false);
    }
  }, []);

  // デバウンス付きカイポケチェック
  const checkKaipokeDebounced = useCallback((faxNumber: string) => {
    if (kaipokeCheckDebounceRef.current) {
      clearTimeout(kaipokeCheckDebounceRef.current);
    }

    kaipokeCheckDebounceRef.current = setTimeout(() => {
      checkKaipoke(faxNumber);
    }, 300);
  }, [checkKaipoke]);

  // カイポケチェック結果をクリア
  const clearKaipokeCheckResult = useCallback(() => {
    setKaipokeCheckResult([]);
  }, []);

  // ---------------------------------------------------------
  // API 呼び出し - 新規作成
  // ---------------------------------------------------------
  const createEntry = useCallback(async (
    data: {
      name: string;
      name_kana?: string | null;
      fax_number?: string | null;
      notes?: string | null;
    }
  ): Promise<{ ok: boolean; entry?: CmLocalFaxPhonebookEntry; error?: string }> => {
    try {
      const res = await fetch('/api/cm/local-fax-phonebook', {
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
      name?: string;
      name_kana?: string | null;
      fax_number?: string | null;
      notes?: string | null;
      is_active?: boolean;
    }
  ): Promise<boolean> => {
    setUpdatingId(id);
    setUpdateError(null);

    try {
      const res = await fetch(`/api/cm/local-fax-phonebook/${id}`, {
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

      // 一覧を再取得（カイポケ情報も含めて更新するため）
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
  // API 呼び出し - フィールド単体更新（インライン編集用）
  // ---------------------------------------------------------
  const updateField = useCallback(async (
    id: number,
    field: string,
    value: string | boolean | null
  ): Promise<boolean> => {
    return updateEntry(id, { [field]: value });
  }, [updateEntry]);

  // ---------------------------------------------------------
  // API 呼び出し - 削除
  // ---------------------------------------------------------
  const deleteEntry = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/cm/local-fax-phonebook/${id}`, {
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
  // API 呼び出し - XML同期
  // ---------------------------------------------------------
  const syncWithXml = useCallback(async (): Promise<CmLocalFaxPhonebookSyncResult | null> => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/cm/local-fax-phonebook/sync', {
        method: 'POST',
        credentials: 'include',
      });

      const data: SyncResponse = await res.json();

      const result: CmLocalFaxPhonebookSyncResult = {
        ok: data.ok,
        summary: data.summary || { xmlOnly: 0, dbOnly: 0, different: 0, duration: 0 },
        log: data.log || [],
        error: data.error,
      };

      setSyncResult(result);

      // 同期成功時は一覧を再取得
      if (data.ok) {
        await fetchEntries();
      }

      return result;
    } catch (e) {
      const result: CmLocalFaxPhonebookSyncResult = {
        ok: false,
        summary: { xmlOnly: 0, dbOnly: 0, different: 0, duration: 0 },
        log: [],
        error: e instanceof Error ? e.message : '通信エラー',
      };
      setSyncResult(result);
      return result;
    } finally {
      setSyncing(false);
    }
  }, [fetchEntries]);

  // ---------------------------------------------------------
  // 初回読み込み & フィルター/ページ変更時
  // ---------------------------------------------------------
  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (kaipokeCheckDebounceRef.current) {
        clearTimeout(kaipokeCheckDebounceRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleFilterChange = useCallback((key: keyof CmLocalFaxPhonebookFilters, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
    fetchEntries();
  }, [fetchEntries]);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const clearUpdateError = useCallback(() => {
    setUpdateError(null);
  }, []);

  const clearSyncResult = useCallback(() => {
    setSyncResult(null);
  }, []);

  // ---------------------------------------------------------
  // 計算値
  // ---------------------------------------------------------
  const isFiltered =
    filters.name !== '' ||
    filters.faxNumber !== '' ||
    filters.showInactive !== false;

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    entries,
    pagination,
    loading,
    error,

    // フィルター
    filters,
    isFiltered,

    // 更新状態
    updatingId,
    updateError,

    // 同期状態
    syncing,
    syncResult,

    // カイポケチェック
    checkingKaipoke,
    kaipokeCheckResult,
    checkKaipoke,
    checkKaipokeDebounced,
    clearKaipokeCheckResult,

    // ハンドラー
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    refresh: fetchEntries,
    clearUpdateError,
    clearSyncResult,

    // CRUD操作
    createEntry,
    updateEntry,
    updateField,
    deleteEntry,
    syncWithXml,
  };
}
