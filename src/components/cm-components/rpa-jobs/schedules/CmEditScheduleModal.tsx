// =============================================================
// src/components/cm-components/rpa-jobs/schedules/CmEditScheduleModal.tsx
// スケジュール設定編集モーダル
// =============================================================

'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { CmScheduledJobType } from '@/types/cm/scheduledJobs';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  jobType: CmScheduledJobType;
  onUpdate: (
    jobTypeId: number,
    payload: Record<string, unknown>,
    cancelPending: boolean,
    isScheduled: boolean
  ) => void;
};

export function CmEditScheduleModal({
  isOpen,
  onClose,
  jobType,
  onUpdate,
}: Props) {
  const [payloadStr, setPayloadStr] = useState(
    JSON.stringify(jobType.schedule_payload, null, 2)
  );
  const [cancelPending, setCancelPending] = useState(jobType.schedule_cancel_pending);
  const [isScheduled, setIsScheduled] = useState(jobType.is_scheduled);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      setError('パラメータのJSON形式が不正です');
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdate(jobType.id, payload, cancelPending, isScheduled);
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
            <h3 className="text-lg font-semibold text-slate-900">スケジュール設定</h3>
            <p className="text-sm text-slate-500 mt-1">
              {jobType.name}（{jobType.queue_name}）
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

            {/* パラメータ */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                パラメータ (JSON)
              </label>
              <textarea
                value={payloadStr}
                onChange={(e) => setPayloadStr(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">
                  有効
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
              disabled={isSubmitting}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}