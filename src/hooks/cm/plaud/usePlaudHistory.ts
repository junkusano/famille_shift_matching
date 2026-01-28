// =============================================================
// src/hooks/cm/plaud/usePlaudHistory.ts
// 処理履歴管理フック（Server Action版）
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import {
  getPlaudHistoryList,
  getPlaudHistory,
  createPlaudHistory,
  updatePlaudHistory,
  deletePlaudHistory,
  type PlaudHistory,
} from '@/lib/cm/plaud/history';
import {
  CmPlaudProcessHistoryWithDetails,
  CmPlaudPagination,
  CmPlaudHistoryCreateRequest,
  CmPlaudHistoryUpdateRequest,
} from '@/types/cm/plaud';

// =============================================================
// 型定義
// =============================================================

type UsePlaudHistoryReturn = {
  history: CmPlaudProcessHistoryWithDetails[];
  pagination: CmPlaudPagination | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  setPage: (page: number) => void;
  refresh: () => Promise<void>;
  create: (data: CmPlaudHistoryCreateRequest) => Promise<CmPlaudProcessHistoryWithDetails | null>;
  update: (id: number, data: CmPlaudHistoryUpdateRequest) => Promise<CmPlaudProcessHistoryWithDetails | null>;
  remove: (id: number) => Promise<boolean>;
};

// =============================================================
// 型変換ヘルパー
// =============================================================

function toHistoryWithDetails(h: PlaudHistory): CmPlaudProcessHistoryWithDetails {
  return {
    id: h.id,
    transcription_id: h.transcription_id,
    template_id: h.template_id,
    kaipoke_cs_id: h.kaipoke_cs_id,
    input_text: h.input_text,
    output_text: h.output_text,
    processed_at: h.processed_at,
    created_at: h.created_at,
    updated_at: h.updated_at,
    transcription_title: h.transcription_title ?? '（削除済み）',
    template_name: h.template_name ?? '（削除済み）',
    client_name: h.client_name ?? null,
  };
}

// =============================================================
// フック本体
// =============================================================

export function usePlaudHistory(transcriptionId?: number): UsePlaudHistoryReturn {
  const [history, setHistory] = useState<CmPlaudProcessHistoryWithDetails[]>([]);
  const [pagination, setPagination] = useState<CmPlaudPagination | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ取得
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getPlaudHistoryList({
        page,
        limit: 20,
        transcriptionId,
      });

      if (result.ok === false){
        throw new Error(result.error);
      }

      setHistory((result.data?.history ?? []).map(toHistoryWithDetails));
      setPagination(result.data?.pagination ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '処理履歴の取得に失敗しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, transcriptionId]);

  // 初回・依存変更時に取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 作成
  const create = useCallback(async (
    data: CmPlaudHistoryCreateRequest
  ): Promise<CmPlaudProcessHistoryWithDetails | null> => {
    try {
      const result = await createPlaudHistory({
        transcription_id: data.transcription_id,
        template_id: data.template_id,
        kaipoke_cs_id: data.kaipoke_cs_id,
        input_text: data.input_text,
        output_text: data.output_text,
      });

      if (result.ok === false){
        throw new Error(result.error);
      }

      // 詳細データを再取得してローカルステートに追加
      const detailResult = await getPlaudHistory(result.data!.id);

      if (detailResult.ok && detailResult.data) {
        const newHistory = toHistoryWithDetails(detailResult.data);
        setHistory((prev) => [newHistory, ...prev]);
        return newHistory;
      }

      return toHistoryWithDetails(result.data!);
    } catch (err) {
      console.error('create history error:', err);
      return null;
    }
  }, []);

  // 更新
  const update = useCallback(async (
    id: number,
    data: CmPlaudHistoryUpdateRequest
  ): Promise<CmPlaudProcessHistoryWithDetails | null> => {
    try {
      const result = await updatePlaudHistory(id, {
        output_text: data.output_text,
      });

      if (result.ok === false){
        throw new Error(result.error);
      }

      // ローカルステート更新
      setHistory((prev) =>
        prev.map((h) =>
          h.id === id
            ? { ...h, output_text: data.output_text, updated_at: new Date().toISOString() }
            : h
        )
      );

      return toHistoryWithDetails(result.data!);
    } catch (err) {
      console.error('update history error:', err);
      return null;
    }
  }, []);

  // 削除
  const remove = useCallback(async (id: number): Promise<boolean> => {
    try {
      const result = await deletePlaudHistory(id);

      if (result.ok === false){
        throw new Error(result.error);
      }

      // ローカルステート更新
      setHistory((prev) => prev.filter((h) => h.id !== id));

      return true;
    } catch (err) {
      console.error('delete history error:', err);
      return false;
    }
  }, []);

  return {
    history,
    pagination,
    isLoading,
    error,
    page,
    setPage,
    refresh: fetchData,
    create,
    update,
    remove,
  };
}