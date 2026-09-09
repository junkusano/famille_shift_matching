// =============================================================
// src/components/cm-components/rpa-jobs/schedules/ScheduleRow.tsx
// 定期スケジュール一覧 - 行コンポーネント
// =============================================================

'use client';

import React from 'react';
import {
  GripVertical,
  ToggleRight,
  ToggleLeft,
  Play,
  History,
  Settings,
  X,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { CmScheduledJobType } from '@/types/cm/scheduledJobs';

type RowProps = {
  jobType: CmScheduledJobType;
  index: number;
  isDragging: boolean;
  onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent, targetId: number) => void;
  onDragEnd: () => void;
  onToggleActive: (jobType: CmScheduledJobType) => void;
  onRunNow: (jobType: CmScheduledJobType) => void;
  onEdit: (jobType: CmScheduledJobType) => void;
  onShowHistory: (jobType: CmScheduledJobType) => void;
  onRemove: (jobType: CmScheduledJobType) => void;
};

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScheduleRow({
  jobType,
  index,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onToggleActive,
  onRunNow,
  onEdit,
  onShowHistory,
  onRemove,
}: RowProps) {
  const isActive = jobType.is_scheduled;

  return (
    <tr
      draggable
      onDragStart={() => onDragStart(jobType.id)}
      onDragOver={(e) => onDragOver(e, jobType.id)}
      onDragEnd={onDragEnd}
      className={`
        hover:bg-slate-50 transition-colors
        ${isDragging ? 'opacity-50 bg-blue-50' : ''}
        ${!isActive ? 'bg-slate-50/50' : ''}
      `}
    >
      <td className="px-2 py-3">
        <div
          className="flex items-center justify-center w-8 h-8 rounded cursor-grab hover:bg-slate-100 transition-colors active:cursor-grabbing"
          title="ドラッグして並び替え"
        >
          <GripVertical className="w-5 h-5 text-slate-400" />
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-sm font-medium text-slate-600">
          {index + 1}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onToggleActive(jobType)}
          className={`p-1.5 rounded transition-colors ${
            isActive
              ? 'text-green-600 hover:bg-green-50'
              : 'text-slate-400 hover:bg-slate-100'
          }`}
          title={isActive ? '有効（クリックで無効化）' : '無効（クリックで有効化）'}
        >
          {isActive ? (
            <ToggleRight className="w-5 h-5" />
          ) : (
            <ToggleLeft className="w-5 h-5" />
          )}
        </button>
      </td>
      <td className={`px-4 py-3 ${!isActive ? 'opacity-60' : ''}`}>
        <div className="font-medium text-slate-900">{jobType.name}</div>
        <div className="text-xs text-slate-500 mt-0.5 font-mono">
          {JSON.stringify(jobType.schedule_payload)}
        </div>
      </td>
      <td className={`px-4 py-3 ${!isActive ? 'opacity-60' : ''}`}>
        <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
          {jobType.queue_name}
        </span>
      </td>
      <td className={`px-4 py-3 ${!isActive ? 'opacity-60' : ''}`}>
        {jobType.schedule_last_run_at ? (
          <div className="flex items-center gap-1.5">
            {jobType.schedule_last_run_status === 'success' ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            <div>
              <div className="text-sm text-slate-900">
                {jobType.schedule_last_run_status === 'success' ? '成功' : '失敗'}
              </div>
              <div className="text-xs text-slate-500">
                {formatDateTime(jobType.schedule_last_run_at)}
              </div>
            </div>
          </div>
        ) : (
          <span className="text-sm text-slate-400">未実行</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button onClick={() => onRunNow(jobType)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="今すぐ実行">
            <Play className="w-4 h-4" />
          </button>
          <button onClick={() => onShowHistory(jobType)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="実行履歴">
            <History className="w-4 h-4" />
          </button>
          <button onClick={() => onEdit(jobType)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="設定">
            <Settings className="w-4 h-4" />
          </button>
          <button onClick={() => onRemove(jobType)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="定期実行から除外">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
