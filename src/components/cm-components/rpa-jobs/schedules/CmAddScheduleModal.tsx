// =============================================================
// src/components/cm-components/rpa-jobs/schedules/CmAddScheduleModal.tsx
// ジョブタイプ追加モーダル
// =============================================================

'use client';

import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import type { CmAvailableJobType } from '@/types/cm/scheduledJobs';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  availableJobTypes: CmAvailableJobType[];
  onAdd: (jobTypeId: number, payload: Record<string, unknown>, cancelPending: boolean) => void;
};

export function CmAddScheduleModal({
  isOpen,
  onClose,
  availableJobTypes,
  onAdd,
}: Props) {
  const [selectedJobTypeId, setSelectedJobTypeId] = useState<number | ''>('');
  const [payloadStr, setPayloadStr] = useState('{}');
  const [cancelPending, setCancelPending] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // キューごとにグループ化
  const groupedJobTypes = useMemo(() => {
    const groups: Record<string, CmAvailableJobType[]> = {};
    for (const jt of availableJobTypes) {
      if (!groups[jt.queue_name]) {
        groups[jt.queue_name] = [];
      }
      groups[jt.queue_name].push(jt);
    }
    return groups;
  }, [availableJobTypes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedJobTypeId) {
      setError('ジョブタイプを選択してください');
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      setError('パラメータのJSON形式が不正です');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd(selectedJobTypeId as number, payload, cancelPending);
      // リセット
      setSelectedJobTypeId('');
      setPayloadStr('{}');
      setCancelPending(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              定期実行にジョブタイプを追加
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              毎日 AM 0:30 に自動でジョブが登録されます
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* ジョブタイプ選択 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                ジョブタイプ <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedJobTypeId}
                onChange={(e) => setSelectedJobTypeId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">選択してください</option>
                {Object.entries(groupedJobTypes).map(([queueName, jobTypes]) => (
                  <optgroup key={queueName} label={queueName}>
                    {jobTypes.map((jt) => (
                      <option key={jt.id} value={jt.id}>
                        {jt.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {availableJobTypes.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  追加可能なジョブタイプがありません
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                ※ 既に定期実行に設定されているジョブタイプは表示されません
              </p>
            </div>

            {/* パラメータ */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                パラメータ (JSON)
              </label>
              <textarea
                value={payloadStr}
                onChange={(e) => setPayloadStr(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder='{}'
              />
              <p className="mt-1 text-xs text-slate-500">
                <code className="bg-slate-100 px-1 rounded">&quot;auto&quot;</code> は実行時の値に自動変換されます
              </p>
            </div>

            {/* オプション */}
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cancelPending}
                  onChange={(e) => setCancelPending(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">
                  実行前にpending状態のジョブをキャンセルする
                </span>
              </label>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedJobTypeId}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? '追加中...' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}