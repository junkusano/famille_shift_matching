// =============================================================
// src/hooks/cm/rpa/useCmRpaJobs.ts
// RPA ジョブ管理の状態管理・Server Actions呼び出し
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  getJobMaster,
  getJobs,
  getJobDetail,
  createJob as createJobAction,
  updateJob as updateJobAction,
  type UpdateJobParams,
} from '@/lib/cm/rpa-jobs/actions';
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
      const result = await getJobMaster();

      if (result.ok === false) {
        throw new Error(result.error);
      }

      setMasterState({
        queues: result.queues,
        jobTypes: result.jobTypes,
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
      const result = await getJobs({
        queue: filters.queue || undefined,
        status: filters.status || undefined,
        limit: 50,
      });

      if (result.ok === false) {
        throw new Error(result.error);
      }

      setListState({
        jobs: result.jobs,
        total: result.total,
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
      const result = await getJobDetail(jobId);

      if (result.ok === false) {
        throw new Error(result.error);
      }

      setDetailState({
        job: result.job,
        items: result.items,
        progress: result.progress,
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
        const result = await createJobAction({
          queue,
          job_type: jobType,
          payload,
        });

        if (result.ok === false) {
          return { ok: false, error: result.error };
        }

        // 一覧を再取得
        await fetchJobs();

        return { ok: true, job: result.job };
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
        const params: UpdateJobParams = {
          status: status as UpdateJobParams['status'],
        };
        if (errorMessage) {
          params.error_message = errorMessage;
        }

        const result = await updateJobAction(jobId, params);

        if (result.ok === false) {
          return { ok: false, error: result.error };
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