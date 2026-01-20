// =============================================================
// src/app/cm-portal/local-fax-phonebook/page.tsx
// ローカルFAX電話帳管理画面
// =============================================================

'use client';

import React, { useState } from 'react';
import { RefreshCw, Plus, CloudDownload, FileText } from 'lucide-react';
import { useCmLocalFaxPhonebook } from '@/hooks/cm/useCmLocalFaxPhonebook';
import { CmLocalFaxPhonebookFilters } from '@/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookFilters';
import { CmLocalFaxPhonebookTable } from '@/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookTable';
import { CmLocalFaxPhonebookModal } from '@/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookModal';
import { CmDeleteConfirmModal } from '@/components/cm-components/local-fax-phonebook/CmDeleteConfirmModal';
import { CmSyncResultModal } from '@/components/cm-components/local-fax-phonebook/CmSyncResultModal';
import type { CmLocalFaxPhonebookEntryWithKaipoke } from '@/types/cm/localFaxPhonebook';

export default function CmLocalFaxPhonebookPage() {
  const {
    entries,
    pagination,
    loading,
    error,
    filters,
    isFiltered,
    updatingId,
    updateError,
    syncing,
    syncResult,
    checkingKaipoke,
    kaipokeCheckResult,
    handleFilterChange,
    handleSearch,
    handleReset,
    handlePageChange,
    refresh,
    clearUpdateError,
    clearSyncResult,
    checkKaipokeDebounced,
    clearKaipokeCheckResult,
    createEntry,
    updateEntry,
    deleteEntry,
    syncWithXml,
  } = useCmLocalFaxPhonebook();

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CmLocalFaxPhonebookEntryWithKaipoke | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<CmLocalFaxPhonebookEntryWithKaipoke | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isSyncResultModalOpen, setIsSyncResultModalOpen] = useState(false);

  // ハンドラー: 新規登録
  const handleAdd = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  // ハンドラー: 編集
  const handleEdit = (entry: CmLocalFaxPhonebookEntryWithKaipoke) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  // ハンドラー: 保存
  const handleSave = async (data: {
    name: string;
    name_kana?: string | null;
    fax_number?: string | null;
    notes?: string | null;
    is_active?: boolean;
  }): Promise<{ ok: boolean; error?: string }> => {
    setIsSaving(true);
    try {
      if (editingEntry) {
        // 更新
        const success = await updateEntry(editingEntry.id, data);
        return { ok: success, error: success ? undefined : '更新に失敗しました' };
      } else {
        // 新規作成
        const result = await createEntry(data);
        return result;
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ハンドラー: 削除確認
  const handleDelete = (entry: CmLocalFaxPhonebookEntryWithKaipoke) => {
    setDeletingEntry(entry);
    setIsDeleteModalOpen(true);
  };

  // ハンドラー: 削除実行
  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    setIsDeleting(true);
    try {
      const success = await deleteEntry(deletingEntry.id);
      if (success) {
        setIsDeleteModalOpen(false);
        setDeletingEntry(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // ハンドラー: XML同期
  const handleSync = async () => {
    const result = await syncWithXml();
    if (result) {
      setIsSyncResultModalOpen(true);
    }
  };

  // ハンドラー: 同期結果モーダルを閉じる
  const handleCloseSyncResult = () => {
    setIsSyncResultModalOpen(false);
    clearSyncResult();
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            ローカルFAX電話帳
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            複合機のFAX電話帳を管理します（DBとXMLの双方向同期）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm font-medium bg-white"
          >
            <CloudDownload className={`w-4 h-4 ${syncing ? 'animate-pulse' : ''}`} />
            {syncing ? '同期中...' : 'XML同期'}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm font-medium bg-white"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            更新
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新規登録
          </button>
        </div>
      </div>

      {/* 情報バナー */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">データソースについて</p>
            <p className="mt-1 text-blue-700">
              この画面で管理するデータは
              <strong>ローカルFAX電話帳</strong>
              です。
              <span className="inline-block px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium mx-1">
                緑の行
              </span>
              はカイポケにも登録されているFAX番号です。
              FAXの紐付けはカイポケデータが優先されます。
            </p>
          </div>
        </div>
      </div>

      {/* フィルター */}
      <CmLocalFaxPhonebookFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* 件数表示 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">
            {pagination?.total.toLocaleString() ?? entries.length}
          </span>{' '}
          件
        </span>
        {isFiltered && (
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
            フィルター適用中
          </span>
        )}
      </div>

      {/* テーブル */}
      <CmLocalFaxPhonebookTable
        entries={entries}
        pagination={pagination}
        loading={loading}
        error={error}
        updatingId={updatingId}
        updateError={updateError}
        onPageChange={handlePageChange}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onUpdateField={(id, field, value) =>
          updateEntry(id, { [field]: value }).then((success) => success)
        }
        onClearUpdateError={clearUpdateError}
      />

      {/* 登録・編集モーダル */}
      <CmLocalFaxPhonebookModal
        isOpen={isModalOpen}
        entry={editingEntry}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(null);
        }}
        onSave={handleSave}
        isSaving={isSaving}
        kaipokeCheckResult={kaipokeCheckResult}
        checkingKaipoke={checkingKaipoke}
        onCheckKaipoke={checkKaipokeDebounced}
        onClearKaipokeCheck={clearKaipokeCheckResult}
      />

      {/* 削除確認モーダル */}
      <CmDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        entry={deletingEntry}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingEntry(null);
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      {/* 同期結果モーダル */}
      <CmSyncResultModal
        isOpen={isSyncResultModalOpen}
        result={syncResult}
        onClose={handleCloseSyncResult}
      />
    </div>
  );
}
