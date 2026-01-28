// =============================================================
// src/hooks/cm/plaud/usePlaudTranscriptions.ts
// 文字起こし一覧管理フック（Server Action版）
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import {
  getPlaudTranscriptionList,
  executeTranscriptionAction,
  updateTranscriptionClient,
  type PlaudTranscription,
} from '@/lib/cm/plaud/transcriptions';
import {
  CmPlaudTranscription,
  CmPlaudTranscriptionFilters,
  CmPlaudPagination,
  CM_PLAUD_TRANSCRIPTION_DEFAULT_FILTERS,
} from '@/types/cm/plaud';

// =============================================================
// 型定義
// =============================================================

type StatusCounts = {
  all: number;
  pending: number;
  approved: number;
  completed: number;
  failed: number;
};

type UsePlaudTranscriptionsReturn = {
  transcriptions: CmPlaudTranscription[];
  pagination: CmPlaudPagination | null;
  counts: StatusCounts;
  lastSyncAt: string | null;
  filters: CmPlaudTranscriptionFilters;
  setFilters: (filters: CmPlaudTranscriptionFilters) => void;
  resetFilters: () => void;
  page: number;
  setPage: (page: number) => void;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  approve: (id: number) => Promise<boolean>;
  reject: (id: number) => Promise<boolean>;
  retry: (id: number) => Promise<boolean>;
  updateClient: (id: number, kaipokeCsId: string | null) => Promise<boolean>;
};

// =============================================================
// 型変換ヘルパー
// =============================================================

function toTranscription(t: PlaudTranscription): CmPlaudTranscription {
  return {
    id: t.id,
    plaud_uuid: t.plaud_uuid,
    title: t.title,
    transcript: t.transcript,
    kaipoke_cs_id: t.kaipoke_cs_id,
    status: t.status,
    retry_count: t.retry_count,
    plaud_created_at: t.plaud_created_at,
    registered_by: t.registered_by,
    created_at: t.created_at,
    updated_at: t.updated_at,
    client_name: t.client_name ?? null,
  };
}

// =============================================================
// フック本体
// =============================================================

export function usePlaudTranscriptions(): UsePlaudTranscriptionsReturn {
  // 状態
  const [transcriptions, setTranscriptions] = useState<CmPlaudTranscription[]>([]);
  const [pagination, setPagination] = useState<CmPlaudPagination | null>(null);
  const [counts, setCounts] = useState<StatusCounts>({
    all: 0,
    pending: 0,
    approved: 0,
    completed: 0,
    failed: 0,
  });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [filters, setFilters] = useState<CmPlaudTranscriptionFilters>(
    CM_PLAUD_TRANSCRIPTION_DEFAULT_FILTERS
  );
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ取得
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getPlaudTranscriptionList({
        page,
        limit: 20,
        status: filters.status !== 'all' ? filters.status : undefined,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      const data = result.data!;
      setTranscriptions(data.transcriptions.map(toTranscription));
      setPagination(data.pagination);

      // カウント取得（別途全件取得してカウント）
      // 注意: 効率化のため、本番環境では専用のカウントAPIを用意することを推奨
      const allResult = await getPlaudTranscriptionList({ limit: 1000 });
      if (allResult.ok && allResult.data) {
        const all = allResult.data.transcriptions;
        setCounts({
          all: all.length,
          pending: all.filter((t) => t.status === 'pending').length,
          approved: all.filter((t) => t.status === 'approved').length,
          completed: all.filter((t) => t.status === 'completed').length,
          failed: all.filter((t) => t.status === 'failed').length,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'データの取得に失敗しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, filters]);

  // 初回・依存変更時に取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // フィルターリセット
  const resetFilters = useCallback(() => {
    setFilters(CM_PLAUD_TRANSCRIPTION_DEFAULT_FILTERS);
    setPage(1);
  }, []);

  // 承認
  const approve = useCallback(async (id: number): Promise<boolean> => {
    try {
      const result = await executeTranscriptionAction(id, 'approve');

      if (!result.ok) {
        throw new Error(result.error);
      }

      // ローカルステートを更新
      setTranscriptions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'approved' as const } : t))
      );

      // カウント更新
      setCounts((prev) => ({
        ...prev,
        pending: prev.pending - 1,
        approved: prev.approved + 1,
      }));

      return true;
    } catch (err) {
      console.error('approve error:', err);
      return false;
    }
  }, []);

  // 却下（pending に戻す - 現在未実装）
  const reject = useCallback(async (id: number): Promise<boolean> => {
    console.warn('reject is not implemented yet', id);
    return false;
  }, []);

  // リトライ
  const retry = useCallback(async (id: number): Promise<boolean> => {
    try {
      const result = await executeTranscriptionAction(id, 'retry');

      if (!result.ok) {
        throw new Error(result.error);
      }

      // ローカルステートを更新
      setTranscriptions((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: 'approved' as const, retry_count: 0 } : t
        )
      );

      // カウント更新
      setCounts((prev) => ({
        ...prev,
        failed: prev.failed - 1,
        approved: prev.approved + 1,
      }));

      return true;
    } catch (err) {
      console.error('retry error:', err);
      return false;
    }
  }, []);

  // 利用者紐付け更新
  const updateClientHandler = useCallback(async (id: number, kaipokeCsId: string | null): Promise<boolean> => {
    try {
      const result = await updateTranscriptionClient(id, kaipokeCsId);

      if (!result.ok) {
        throw new Error(result.error);
      }

      // ローカルステートも更新
      setTranscriptions((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, kaipoke_cs_id: kaipokeCsId, client_name: result.data?.client_name ?? null }
            : t
        )
      );

      return true;
    } catch (err) {
      console.error('updateClient error:', err);
      return false;
    }
  }, []);

  return {
    transcriptions,
    pagination,
    counts,
    lastSyncAt,
    filters,
    setFilters,
    resetFilters,
    page,
    setPage,
    isLoading,
    error,
    refresh: fetchData,
    approve,
    reject,
    retry,
    updateClient: updateClientHandler,
  };
}