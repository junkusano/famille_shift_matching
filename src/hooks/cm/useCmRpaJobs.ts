// =============================================================
// src/hooks/cm/useCmRpaJobs.ts
// RPA ジョブ管理の状態管理・API呼び出し
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  CmJobWithProgress,
  CmJob,
  CmJobItem,
  CmJobProgress,
  CmJobQueue,
  CmJobTypemaster,
} from '@/types/cm/jobs';

// =============================================================
// 型定義
// =============================================================

type JobFilters = {
  queue: string;
  status: string;
};

type JobListState = {
  jobs: CmJobWithProgress[];
  total: number;
  loading: boolean;
  error: string | null;
};

type JobDetailState = {
  job: CmJob | null;
  items: CmJobItem[];
  progress: CmJobProgress | null;
  loading: boolean;
  error: string | null;
};

type MasterState = {
  queues: CmJobQueue[];
  jobTypes: CmJobTypemaster[];
  loading: boolean;
  error: string | null;
};

// =============================================================
// Hook
// =============================================================

export function useCmRpaJobs() {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [listState, setListState] = useState<JobListState>({
    jobs: [],
    total: 0,
    loading: false,
    error: null,
  });

  const [detailState, setDetailState] = useState<JobDetailState>({
    job: null,
    items: [],
    progress: null,
    loading: false,
    error: null,
  });

  const [masterState, setMasterState] = useState<MasterState>({
    queues: [],
    jobTypes: [],
    loading: false,
    error: null,
  });

  const [filters, setFilters] = useState<JobFilters>({
    queue: '',
    status: '',
  });

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  // ---------------------------------------------------------
  // マスタ取得
  // ---------------------------------------------------------
  const fetchMaster = useCallback(async () => {
    setMasterState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch('/api/cm/rpa-internal/jobs/master', {
        credentials: 'include',
      });
      const data = await res.json();

      if (!data.ok) {
        setMasterState((prev) => ({
          ...prev,
          loading: false,
          error: data.error || 'マスタ取得エラー',
        }));
        return;
      }

      setMasterState({
        queues: data.queues || [],
        jobTypes: data.jobTypes || [],
        loading: false,
        error: null,
      });
    } catch (e) {
      setMasterState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : 'エラー',
      }));
    }
  }, []);

  // ---------------------------------------------------------
  // ジョブ一覧取得
  // ---------------------------------------------------------
  const fetchJobs = useCallback(async () => {
    setListState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const params = new URLSearchParams();
      if (filters.queue) params.set('queue', filters.queue);
      if (filters.status) params.set('status', filters.status);
      params.set('limit', '50');

      const res = await fetch(`/api/cm/rpa-internal/jobs?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!data.ok) {
        setListState((prev) => ({
          ...prev,
          loading: false,
          error: data.error || 'ジョブ取得エラー',
        }));
        return;
      }

      setListState({
        jobs: data.jobs || [],
        total: data.total || 0,
        loading: false,
        error: null,
      });
    } catch (e) {
      setListState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : 'エラー',
      }));
    }
  }, [filters]);

  // ---------------------------------------------------------
  // ジョブ詳細取得
  // ---------------------------------------------------------
  const fetchJobDetail = useCallback(async (jobId: number) => {
    setDetailState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch(`/api/cm/rpa-internal/jobs/${jobId}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!data.ok) {
        setDetailState((prev) => ({
          ...prev,
          loading: false,
          error: data.error || 'ジョブ詳細取得エラー',
        }));
        return;
      }

      setDetailState({
        job: data.job || null,
        items: data.items || [],
        progress: data.progress || null,
        loading: false,
        error: null,
      });
    } catch (e) {
      setDetailState((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : 'エラー',
      }));
    }
  }, []);

  // ---------------------------------------------------------
  // ジョブ作成
  // ---------------------------------------------------------
  const createJob = useCallback(
    async (
      queue: string,
      jobType: string,
      payload: Record<string, unknown> = {}
    ): Promise<{ ok: boolean; job?: CmJob; error?: string }> => {
      setCreating(true);

      try {
        const res = await fetch('/api/cm/rpa-internal/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ queue, job_type: jobType, payload }),
        });
        const data = await res.json();

        if (!data.ok) {
          return { ok: false, error: data.error || 'ジョブ作成エラー' };
        }

        // 一覧を再取得
        await fetchJobs();

        return { ok: true, job: data.job };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'エラー',
        };
      } finally {
        setCreating(false);
      }
    },
    [fetchJobs]
  );

  // ---------------------------------------------------------
  // ジョブ更新（キャンセル等）
  // ---------------------------------------------------------
  const updateJobStatus = useCallback(
    async (
      jobId: number,
      status: string,
      errorMessage?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      setUpdating(true);

      try {
        const body: Record<string, unknown> = { status };
        if (errorMessage) body.error_message = errorMessage;

        const res = await fetch(`/api/cm/rpa-internal/jobs/${jobId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!data.ok) {
          return { ok: false, error: data.error || 'ジョブ更新エラー' };
        }

        // 一覧を再取得
        await fetchJobs();

        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'エラー',
        };
      } finally {
        setUpdating(false);
      }
    },
    [fetchJobs]
  );

  // ---------------------------------------------------------
  // 詳細クリア
  // ---------------------------------------------------------
  const clearDetail = useCallback(() => {
    setDetailState({
      job: null,
      items: [],
      progress: null,
      loading: false,
      error: null,
    });
  }, []);

  // ---------------------------------------------------------
  // 初回読み込み
  // ---------------------------------------------------------
  useEffect(() => {
    fetchMaster();
  }, [fetchMaster]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // 一覧
    jobs: listState.jobs,
    totalJobs: listState.total,
    listLoading: listState.loading,
    listError: listState.error,
    fetchJobs,

    // 詳細
    jobDetail: detailState.job,
    jobItems: detailState.items,
    jobProgress: detailState.progress,
    detailLoading: detailState.loading,
    detailError: detailState.error,
    fetchJobDetail,
    clearDetail,

    // マスタ
    queues: masterState.queues,
    jobTypes: masterState.jobTypes,
    masterLoading: masterState.loading,

    // フィルター
    filters,
    setFilters,

    // 操作
    createJob,
    creating,
    updateJobStatus,
    updating,
  };
}