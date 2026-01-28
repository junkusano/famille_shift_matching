// =============================================================
// src/app/cm-portal/rpa-jobs/page.tsx
// RPA ジョブ管理画面
// =============================================================

'use client';

import React, { useState, useMemo } from 'react';
import { useCmRpaJobs } from '@/hooks/cm/rpa/useCmRpaJobs';
import type { CmJob, CmJobWithProgress, CmJobItem } from '@/types/cm/jobs';

// =============================================================
// ステータスバッジ
// =============================================================

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
    skipped: 'bg-gray-100 text-gray-600',
  };

  const labels: Record<string, string> = {
    pending: '待機中',
    processing: '処理中',
    completed: '完了',
    failed: '失敗',
    cancelled: 'キャンセル',
    skipped: 'スキップ',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        styles[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {labels[status] || status}
    </span>
  );
}

// =============================================================
// 進捗バー
// =============================================================

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, progress)}%` }}
      />
    </div>
  );
}

// =============================================================
// ジョブ作成モーダル
// =============================================================

function CreateJobModal({
  isOpen,
  onClose,
  queues,
  jobTypes,
  onCreate,
  creating,
}: {
  isOpen: boolean;
  onClose: () => void;
  queues: { code: string; name: string }[];
  jobTypes: { queue_code: string; code: string; name: string }[];
  onCreate: (queue: string, jobType: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  creating: boolean;
}) {
  const [selectedQueue, setSelectedQueue] = useState('');
  const [selectedJobType, setSelectedJobType] = useState('');
  const [payloadStr, setPayloadStr] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const filteredJobTypes = useMemo(
    () => jobTypes.filter((jt) => jt.queue_code === selectedQueue),
    [jobTypes, selectedQueue]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedQueue || !selectedJobType) {
      setError('キューとジョブタイプを選択してください');
      return;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      setError('payloadのJSON形式が不正です');
      return;
    }

    const result = await onCreate(selectedQueue, selectedJobType, payload);
    if (result.ok) {
      onClose();
      setSelectedQueue('');
      setSelectedJobType('');
      setPayloadStr('{}');
    } else {
      setError(result.error || 'ジョブ作成に失敗しました');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">新規ジョブ作成</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                キュー
              </label>
              <select
                value={selectedQueue}
                onChange={(e) => {
                  setSelectedQueue(e.target.value);
                  setSelectedJobType('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">選択してください</option>
                {queues.map((q) => (
                  <option key={q.code} value={q.code}>
                    {q.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ジョブタイプ
              </label>
              <select
                value={selectedJobType}
                onChange={(e) => setSelectedJobType(e.target.value)}
                disabled={!selectedQueue}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              >
                <option value="">選択してください</option>
                {filteredJobTypes.map((jt) => (
                  <option key={jt.code} value={jt.code}>
                    {jt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                payload (JSON)
              </label>
              <textarea
                value={payloadStr}
                onChange={(e) => setPayloadStr(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder='{"year_month": "2026-01"}'
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================
// ジョブ詳細モーダル
// =============================================================

function JobDetailModal({
  isOpen,
  onClose,
  job,
  items,
  progress,
  loading,
  onCancel,
  updating,
}: {
  isOpen: boolean;
  onClose: () => void;
  job: CmJob | null;
  items: CmJobItem[];
  progress: { total: number; completed: number; failed: number; pending: number; percent: number } | null;
  loading: boolean;
  onCancel: () => void;
  updating: boolean;
}) {
  if (!isOpen) return null;

  const canCancel = job && ['pending', 'processing'].includes(job.status);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            ジョブ詳細 {job && `#${job.id}`}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">読み込み中...</div>
          ) : job ? (
            <div className="space-y-6">
              {/* 基本情報 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">キュー</div>
                  <div className="font-medium">{job.queue}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">ジョブタイプ</div>
                  <div className="font-medium">{job.job_type}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">ステータス</div>
                  <div><StatusBadge status={job.status} /></div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">作成日時</div>
                  <div className="font-medium">
                    {new Date(job.created_at).toLocaleString('ja-JP')}
                  </div>
                </div>
              </div>

              {/* 進捗 */}
              {progress && progress.total > 0 && (
                <div>
                  <div className="text-sm text-gray-500 mb-2">進捗</div>
                  <ProgressBar progress={progress.percent} />
                  <div className="mt-2 text-sm text-gray-600">
                    {progress.completed} / {progress.total} 完了
                    {progress.failed > 0 && (
                      <span className="text-red-600 ml-2">
                        （{progress.failed} 件失敗）
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* メッセージ */}
              {job.progress_message && (
                <div>
                  <div className="text-sm text-gray-500">進行状況</div>
                  <div className="mt-1 p-3 bg-blue-50 rounded-lg text-sm">
                    {job.progress_message}
                  </div>
                </div>
              )}

              {job.error_message && (
                <div>
                  <div className="text-sm text-gray-500">エラー</div>
                  <div className="mt-1 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                    {job.error_message}
                  </div>
                </div>
              )}

              {/* payload */}
              <div>
                <div className="text-sm text-gray-500">payload</div>
                <pre className="mt-1 p-3 bg-gray-50 rounded-lg text-sm overflow-x-auto">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </div>

              {/* アイテム一覧 */}
              {items.length > 0 && (
                <div>
                  <div className="text-sm text-gray-500 mb-2">
                    アイテム（{items.length}件）
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            対象ID
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            対象名
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            ステータス
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {items.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs">
                              {item.target_id}
                            </td>
                            <td className="px-3 py-2">
                              {item.target_name || '-'}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={item.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              ジョブが見つかりません
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {canCancel && (
            <button
              onClick={onCancel}
              disabled={updating}
              className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {updating ? 'キャンセル中...' : 'ジョブをキャンセル'}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

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
    if (result.ok) {
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
