// =============================================================
// src/components/cm-components/rpa-jobs/schedules/CmScheduleTable.tsx
// 定期スケジュール一覧テーブル（ドラッグ&ドロップ対応）
// =============================================================

'use client';

import React, { useState, useCallback } from 'react';
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
  Calendar,
} from 'lucide-react';
import type { CmScheduledJobType } from '@/types/cm/scheduledJobs';

type Props = {
  jobTypes: CmScheduledJobType[];
  onReorder: (newOrder: number[]) => void;
  onToggleActive: (jobType: CmScheduledJobType) => void;
  onRunNow: (jobType: CmScheduledJobType) => void;
  onEdit: (jobType: CmScheduledJobType) => void;
  onShowHistory: (jobType: CmScheduledJobType) => void;
  onRemove: (jobType: CmScheduledJobType) => void;
};

export function CmScheduleTable({
  jobTypes,
  onReorder,
  onToggleActive,
  onRunNow,
  onEdit,
  onShowHistory,
  onRemove,
}: Props) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [localOrder, setLocalOrder] = useState<number[]>(jobTypes.map((jt) => jt.id));

  // ドラッグ開始
  const handleDragStart = useCallback((id: number) => {
    setDraggedId(id);
  }, []);

  // ドラッグ中（並び替えプレビュー）
  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: number) => {
      e.preventDefault();
      if (draggedId === null || draggedId === targetId) return;

      const newOrder = [...localOrder];
      const draggedIdx = newOrder.indexOf(draggedId);
      const targetIdx = newOrder.indexOf(targetId);

      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedId);
      setLocalOrder(newOrder);
    },
    [draggedId, localOrder]
  );

  // ドラッグ終了
  const handleDragEnd = useCallback(() => {
    if (draggedId !== null) {
      onReorder(localOrder);
    }
    setDraggedId(null);
  }, [draggedId, localOrder, onReorder]);

  // jobTypes が変更されたら localOrder も更新
  React.useEffect(() => {
    setLocalOrder(jobTypes.map((jt) => jt.id));
  }, [jobTypes]);

  // localOrder に基づいてソートされたジョブタイプ
  const sortedJobTypes = localOrder
    .map((id) => jobTypes.find((jt) => jt.id === id))
    .filter(Boolean) as CmScheduledJobType[];

  if (jobTypes.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 py-12 text-center text-slate-500">
        <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p>定期実行に設定されているジョブタイプがありません</p>
        <p className="text-sm mt-1">「ジョブタイプを追加」ボタンから追加してください</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-2 py-3 text-left text-xs font-medium text-slate-500 uppercase w-12"></th>
            <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase w-12">順序</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-16">有効</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">ジョブタイプ</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-32">キュー</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-44">最終実行</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-32">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {sortedJobTypes.map((jobType, index) => (
            <ScheduleRow
              key={jobType.id}
              jobType={jobType}
              index={index}
              isDragging={draggedId === jobType.id}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onToggleActive={onToggleActive}
              onRunNow={onRunNow}
              onEdit={onEdit}
              onShowHistory={onShowHistory}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================
// 行コンポーネント
// =============================================================

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

function ScheduleRow({
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
      {/* ドラッグハンドル */}
      <td className="px-2 py-3">
        <div
          className="flex items-center justify-center w-8 h-8 rounded cursor-grab hover:bg-slate-100 transition-colors active:cursor-grabbing"
          title="ドラッグして並び替え"
        >
          <GripVertical className="w-5 h-5 text-slate-400" />
        </div>
      </td>

      {/* 順序 */}
      <td className="px-3 py-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-sm font-medium text-slate-600">
          {index + 1}
        </span>
      </td>

      {/* 有効/無効 */}
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

      {/* ジョブタイプ */}
      <td className={`px-4 py-3 ${!isActive ? 'opacity-60' : ''}`}>
        <div className="font-medium text-slate-900">{jobType.name}</div>
        <div className="text-xs text-slate-500 mt-0.5 font-mono">
          {JSON.stringify(jobType.schedule_payload)}
        </div>
      </td>

      {/* キュー */}
      <td className={`px-4 py-3 ${!isActive ? 'opacity-60' : ''}`}>
        <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
          {jobType.queue_name}
        </span>
      </td>

      {/* 最終実行 */}
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

      {/* 操作 */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRunNow(jobType)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="今すぐ実行"
          >
            <Play className="w-4 h-4" />
          </button>
          <button
            onClick={() => onShowHistory(jobType)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="実行履歴"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(jobType)}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="設定"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(jobType)}
            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="定期実行から除外"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// =============================================================
// ヘルパー関数
// =============================================================

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}