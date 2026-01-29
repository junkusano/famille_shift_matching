// =============================================================
// src/components/cm-components/rpa-jobs/schedules/CmRemoveScheduleDialog.tsx
// 定期実行除外確認ダイアログ
// =============================================================

'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CmScheduledJobType } from '@/types/cm/scheduledJobs';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  jobType: CmScheduledJobType;
  onRemove: (jobTypeId: number) => void;
};

export function CmRemoveScheduleDialog({
  isOpen,
  onClose,
  jobType,
  onRemove,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRemove = async () => {
    setIsSubmitting(true);
    try {
      await onRemove(jobType.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
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
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            定期実行から除外
          </h3>
        </div>

        <div className="px-6 py-4">
          <p className="text-slate-700">
            <strong>{jobType.name}</strong> を定期実行から除外しますか？
          </p>
          <p className="mt-2 text-sm text-slate-500">
            ジョブタイプ自体は削除されません。後から再度追加できます。
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleRemove}
            disabled={isSubmitting}
            className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? '除外中...' : '除外する'}
          </button>
        </div>
      </div>
    </div>
  );
}
