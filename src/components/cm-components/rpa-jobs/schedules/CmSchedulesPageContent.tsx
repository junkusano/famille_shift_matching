// =============================================================
// src/components/cm-components/rpa-jobs/schedules/CmSchedulesPageContent.tsx
// 定期スケジュール管理画面のClient Component
// =============================================================

'use client';

import React, { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Plus, Info, GripVertical, Play, History, Settings, X } from 'lucide-react';
import { CmScheduleTable } from './CmScheduleTable';
import { CmAddScheduleModal } from './CmAddScheduleModal';
import { CmEditScheduleModal } from './CmEditScheduleModal';
import { CmScheduleHistoryModal } from './CmScheduleHistoryModal';
import { CmRemoveScheduleDialog } from './CmRemoveScheduleDialog';
import {
  addSchedule,
  updateSchedule,
  removeSchedule,
  reorderSchedules,
  toggleScheduleActive,
} from '@/lib/cm/scheduled-jobs/actions';
import { executeSingleSchedule } from '@/lib/cm/scheduled-jobs/runScheduleAction';
import type { CmScheduledJobType, CmAvailableJobType } from '@/types/cm/scheduledJobs';

type Props = {
  scheduledJobTypes: CmScheduledJobType[];
  availableJobTypes: CmAvailableJobType[];
};

export function CmSchedulesPageContent({
  scheduledJobTypes,
  availableJobTypes,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // モーダル状態
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CmScheduledJobType | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CmScheduledJobType | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CmScheduledJobType | null>(null);

  // ローカル状態（楽観的更新用）
  const [localJobTypes, setLocalJobTypes] = useState(scheduledJobTypes);

  // scheduledJobTypes（props）が変更されたらlocalJobTypesも更新
  React.useEffect(() => {
    setLocalJobTypes(scheduledJobTypes);
  }, [scheduledJobTypes]);

  // 更新（再取得）
  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // 並び順変更（ドラッグ後）
  const handleReorder = useCallback(async (newOrder: number[]) => {
    // 楽観的更新
    const reordered = newOrder.map((id, index) => {
      const item = localJobTypes.find((jt) => jt.id === id);
      return item ? { ...item, schedule_order: index + 1 } : null;
    }).filter(Boolean) as CmScheduledJobType[];
    setLocalJobTypes(reordered);

    // サーバー更新
    const result = await reorderSchedules({ order: newOrder });
    if (result.ok === false) {
      // 失敗時はリバート
      setLocalJobTypes(scheduledJobTypes);
      alert(`並び順の更新に失敗しました: ${result.error}`);
    }
  }, [localJobTypes, scheduledJobTypes]);

  // 有効/無効切り替え
  const handleToggleActive = useCallback(async (jobType: CmScheduledJobType) => {
    const newValue = !jobType.is_scheduled;
    
    // 楽観的更新
    setLocalJobTypes((prev) =>
      prev.map((jt) =>
        jt.id === jobType.id ? { ...jt, is_scheduled: newValue } : jt
      )
    );

    const result = await toggleScheduleActive(jobType.id, newValue);
    if (result.ok === false) {
      // 失敗時はリバート
      setLocalJobTypes(scheduledJobTypes);
      alert(`更新に失敗しました: ${result.error}`);
    } else {
      refresh();
    }
  }, [scheduledJobTypes, refresh]);

  // 今すぐ実行
  const handleRunNow = useCallback(async (jobType: CmScheduledJobType) => {
    if (!confirm(`「${jobType.name}」を今すぐ実行しますか？`)) {
      return;
    }

    const result = await executeSingleSchedule(jobType.id);
    if (result.ok === true) {
      alert(`実行完了: ジョブ #${result.result.created_job_id} を作成しました`);
      refresh();
    } else {
      alert(`実行失敗: ${result.error}`);
    }
  }, [refresh]);

  // 追加
  const handleAdd = useCallback(async (
    jobTypeId: number,
    payload: Record<string, unknown>,
    cancelPending: boolean
  ) => {
    const result = await addSchedule({
      jobTypeId,
      schedulePayload: payload,
      scheduleCancelPending: cancelPending,
    });

    if (result.ok === true) {
      setIsAddModalOpen(false);
      refresh();
    } else {
      alert(`追加に失敗しました: ${result.error}`);
    }
  }, [refresh]);

  // 設定更新
  const handleUpdate = useCallback(async (
    jobTypeId: number,
    payload: Record<string, unknown>,
    cancelPending: boolean,
    isScheduled: boolean
  ) => {
    const result = await updateSchedule({
      jobTypeId,
      schedulePayload: payload,
      scheduleCancelPending: cancelPending,
      isScheduled,
    });

    if (result.ok === true) {
      setEditTarget(null);
      refresh();
    } else {
      alert(`更新に失敗しました: ${result.error}`);
    }
  }, [refresh]);

  // 除外
  const handleRemove = useCallback(async (jobTypeId: number) => {
    const result = await removeSchedule(jobTypeId);

    if (result.ok === true) {
      setRemoveTarget(null);
      refresh();
    } else {
      alert(`除外に失敗しました: ${result.error}`);
    }
  }, [refresh]);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">定期スケジュール</h1>
          <p className="text-sm text-slate-500 mt-1">
            毎日自動で実行するジョブを管理します
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
            更新
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            ジョブタイプを追加
          </button>
        </div>
      </div>

      {/* 説明 */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">毎日 AM 0:30 に上から順番に実行されます</p>
            <p className="mt-1 text-blue-700">
              有効なジョブタイプが順番に「pending」状態で登録され、RPAワーカーが処理します。
              前日のpendingジョブは自動でキャンセルされます。
            </p>
          </div>
        </div>
      </div>

      {/* 件数表示 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{localJobTypes.length}</span> 件
        </span>
        {isPending && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium">
            読み込み中...
          </span>
        )}
      </div>

      {/* テーブル */}
      <CmScheduleTable
        jobTypes={localJobTypes}
        onReorder={handleReorder}
        onToggleActive={handleToggleActive}
        onRunNow={handleRunNow}
        onEdit={setEditTarget}
        onShowHistory={setHistoryTarget}
        onRemove={setRemoveTarget}
      />

      {/* 凡例 */}
      <div className="flex items-center gap-6 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <GripVertical className="w-3.5 h-3.5" />
          <span>ドラッグで並び替え</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Play className="w-3.5 h-3.5" />
          <span>今すぐ実行</span>
        </div>
        <div className="flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          <span>実行履歴</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" />
          <span>設定変更</span>
        </div>
        <div className="flex items-center gap-1.5">
          <X className="w-3.5 h-3.5" />
          <span>除外</span>
        </div>
      </div>

      {/* モーダル類 */}
      <CmAddScheduleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        availableJobTypes={availableJobTypes}
        onAdd={handleAdd}
      />

      {editTarget && (
        <CmEditScheduleModal
          isOpen={true}
          onClose={() => setEditTarget(null)}
          jobType={editTarget}
          onUpdate={handleUpdate}
        />
      )}

      {historyTarget && (
        <CmScheduleHistoryModal
          isOpen={true}
          onClose={() => setHistoryTarget(null)}
          jobType={historyTarget}
        />
      )}

      {removeTarget && (
        <CmRemoveScheduleDialog
          isOpen={true}
          onClose={() => setRemoveTarget(null)}
          jobType={removeTarget}
          onRemove={handleRemove}
        />
      )}
    </div>
  );
}