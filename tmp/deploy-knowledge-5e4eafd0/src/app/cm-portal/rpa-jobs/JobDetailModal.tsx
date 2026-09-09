// =============================================================
// src/app/cm-portal/rpa-jobs/JobDetailModal.tsx
// RPAジョブ - ジョブ詳細モーダル
// =============================================================

'use client';

import React from 'react';
import type { CmJob, CmJobItem } from '@/types/cm/jobs';
import { StatusBadge } from './StatusBadge';
import { RpaProgressBar } from './RpaProgressBar';

type JobDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  job: CmJob | null;
  items: CmJobItem[];
  progress: { total: number; completed: number; failed: number; pending: number; percent: number } | null;
  loading: boolean;
  onCancel: () => void;
  updating: boolean;
};

export function JobDetailModal({
  isOpen,
  onClose,
  job,
  items,
  progress,
  loading,
  onCancel,
  updating,
}: JobDetailModalProps) {
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
                  <RpaProgressBar progress={progress.percent} />
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
