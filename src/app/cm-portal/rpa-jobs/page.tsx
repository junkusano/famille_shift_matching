// =============================================================
// src/app/cm-portal/rpa-jobs/page.tsx
// RPA ジョブ管理画面
// =============================================================

'use client';

import React, { useState } from 'react';
import { useCmRpaJobs } from '@/hooks/cm/rpa/useCmRpaJobs';
import type { CmJobWithProgress } from '@/types/cm/jobs';
import { StatusBadge } from './StatusBadge';
import { RpaProgressBar as ProgressBar } from './RpaProgressBar';
import { CreateJobModal } from './CreateJobModal';
import { JobDetailModal } from './JobDetailModal';

// =============================================================
// メインページ
// =============================================================

export default function RpaJobsPage() {
  const {
    jobs,
    listLoading,
    listError,
    fetchJobs,
    jobDetail,
    jobItems,
    jobProgress,
    detailLoading,
    fetchJobDetail,
    clearDetail,
    queues,
    jobTypes,
    filters,
    setFilters,
    createJob,
    creating,
    updateJobStatus,
    updating,
  } = useCmRpaJobs();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<CmJobWithProgress | null>(null);

  const handleViewDetail = (job: CmJobWithProgress) => {
    setSelectedJob(job);
    fetchJobDetail(job.id);
    setIsDetailModalOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedJob(null);
    clearDetail();
  };

  const handleCancelJob = async () => {
    if (!selectedJob) return;
    const result = await updateJobStatus(selectedJob.id, 'cancelled');
    if (result.ok === true) {
      handleCloseDetail();
    }
  };

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">RPAジョブ管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            ジョブの確認・作成・管理を行います
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span>＋</span>
          <span>新規ジョブ</span>
        </button>
      </div>

      {/* フィルター */}
      <div className="mb-6 flex items-center gap-4">
        <div>
          <select
            value={filters.queue}
            onChange={(e) => setFilters({ ...filters, queue: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全てのキュー</option>
            {queues.map((q) => (
              <option key={q.code} value={q.code}>
                {q.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">全てのステータス</option>
            <option value="pending">待機中</option>
            <option value="processing">処理中</option>
            <option value="completed">完了</option>
            <option value="failed">失敗</option>
            <option value="cancelled">キャンセル</option>
          </select>
        </div>
        <button
          onClick={fetchJobs}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          更新
        </button>
      </div>

      {/* エラー表示 */}
      {listError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {listError}
        </div>
      )}

      {/* ジョブ一覧 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {listLoading ? (
          <div className="p-8 text-center text-gray-500">読み込み中...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            ジョブがありません
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  キュー / タイプ
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  進捗
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  作成日時
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">
                    #{job.id}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {job.queue}
                    </div>
                    <div className="text-xs text-gray-500">
                      {job.job_type}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3">
                    {job.total_items > 0 ? (
                      <div className="w-32">
                        <ProgressBar progress={job.progress_percent} />
                        <div className="text-xs text-gray-500 mt-1">
                          {job.completed_items} / {job.total_items}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(job.created_at).toLocaleString('ja-JP')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleViewDetail(job)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      詳細
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 作成モーダル */}
      <CreateJobModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        queues={queues}
        jobTypes={jobTypes}
        onCreate={createJob}
        creating={creating}
      />

      {/* 詳細モーダル */}
      <JobDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetail}
        job={jobDetail || selectedJob}
        items={jobItems}
        progress={jobProgress}
        loading={detailLoading}
        onCancel={handleCancelJob}
        updating={updating}
      />
    </div>
  );
}