// =============================================================
// src/components/cm-components/rpa-jobs/schedules/CmScheduleTable.tsx
// 定期スケジュール一覧テーブル（ドラッグ&ドロップ対応）
// =============================================================

'use client';

import React, { useState, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import type { CmScheduledJobType } from '@/types/cm/scheduledJobs';
import { ScheduleRow } from './ScheduleRow';

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