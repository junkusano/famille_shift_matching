// =============================================================
// src/components/cm-components/rpa-jobs/schedules/CmScheduleHistoryModal.tsx
// 実行履歴モーダル
// =============================================================

'use client';

import React, { useEffect, useState } from 'react';
import { X, Clock, User, CheckCircle, XCircle } from 'lucide-react';
import { getScheduleRuns } from '@/lib/cm/scheduled-jobs/getScheduleRunsClient';
import type { CmScheduledJobType, CmScheduledJobRun } from '@/types/cm/scheduledJobs';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  jobType: CmScheduledJobType;
};

export function CmScheduleHistoryModal({ isOpen, onClose, jobType }: Props) {
  const [runs, setRuns] = useState<CmScheduledJobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);

      getScheduleRuns({ jobTypeId: jobType.id, limit: 20 })
        .then((result) => {
          if (result.ok === true) {
            setRuns(result.runs);
          } else {
            setError(result.error);
          }
        })
        .catch((e) => {
          setError(e.message);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, jobType.id]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">実行履歴</h3>
            <p className="text-sm text-slate-500">
              {jobType.name}（{jobType.queue_name}）
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">読み込み中...</div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              実行履歴がありません
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                  <th className="pb-3 pr-4">実行日時</th>
                  <th className="pb-3 pr-4">トリガー</th>
                  <th className="pb-3 pr-4">結果</th>
                  <th className="pb-3 pr-4">キャンセル</th>
                  <th className="pb-3">作成ジョブ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-4">
                      <div className="text-sm text-slate-900">
                        {formatDateTime(run.started_at)}
                      </div>
                      {run.finished_at && (
                        <div className="text-xs text-slate-500">
                          {formatDuration(run.started_at, run.finished_at)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {run.triggered_by === 'cron' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                          <Clock className="w-3 h-3" />
                          自動
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          <User className="w-3 h-3" />
                          手動
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {run.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" />
                          成功
                        </span>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3" />
                            失敗
                          </span>
                          {run.error_message && (
                            <div className="text-xs text-red-600 mt-1">
                              {run.error_message}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      {run.cancelled_job_ids && run.cancelled_job_ids.length > 0 ? (
                        <span className="text-slate-600">
                          {run.cancelled_job_ids.map((id) => `#${id}`).join(', ')}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 text-sm">
                      {run.created_job_id ? (
                        <a
                          href={`/cm-portal/rpa-jobs?jobId=${run.created_job_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          #{run.created_job_id}
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// ヘルパー関数
// =============================================================

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffSec = Math.round(diffMs / 1000);
  return `${diffSec}秒`;
}