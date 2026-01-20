// =============================================================
// src/app/cm-portal/service-credentials/page.tsx
// サービス認証情報管理画面
// =============================================================

'use client';

import React, { useState } from 'react';
import { RefreshCw, Plus, ShieldCheck } from 'lucide-react';
import { useCmServiceCredentials } from '@/hooks/cm/useCmServiceCredentials';
import { CmServiceCredentialsFilters } from '@/components/cm-components/service-credentials/CmServiceCredentialsFilters';
import { CmServiceCredentialsTable } from '@/components/cm-components/service-credentials/CmServiceCredentialsTable';
import { CmServiceCredentialsModal } from '@/components/cm-components/service-credentials/CmServiceCredentialsModal';
import { CmServiceCredentialsDeleteModal } from '@/components/cm-components/service-credentials/CmServiceCredentialsDeleteModal';
import type {
  CmServiceCredential,
  CmServiceCredentialMasked,
} from '@/types/cm/serviceCredentials';

export default function CmServiceCredentialsPage() {
  const {
    entries,
    loading,
    error,
    filters,
    isFiltered,
    updateError,
    handleFilterChange,
    handleSearch,
    handleReset,
    refresh,
    clearUpdateError,
    fetchEntry,
    createEntry,
    updateEntry,
    deleteEntry,
  } = useCmServiceCredentials();

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CmServiceCredentialMasked | null>(null);
  const [fullEntry, setFullEntry] = useState<CmServiceCredential | null>(null);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<CmServiceCredentialMasked | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ハンドラー: 新規登録
  const handleAdd = () => {
    setEditingEntry(null);
    setFullEntry(null);
    setIsModalOpen(true);
  };

  // ハンドラー: 編集
  const handleEdit = async (entry: CmServiceCredentialMasked) => {
    setEditingEntry(entry);
    setFullEntry(null);
    setIsModalOpen(true);
    
    // 完全なエントリを取得
    setIsLoadingEntry(true);
    const full = await fetchEntry(entry.id);
    setFullEntry(full);
    setIsLoadingEntry(false);
  };

  // ハンドラー: 保存
  const handleSave = async (data: {
    service_name: string;
    label?: string | null;
    credentials: Record<string, unknown>;
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
  const handleDelete = (entry: CmServiceCredentialMasked) => {
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

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            サービス認証情報
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            外部サービスへの接続情報を管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">セキュリティについて</p>
            <p className="mt-1 text-amber-700">
              認証情報はデータベースに保存されます。一覧画面では機密情報はマスク表示されます。
              編集時にのみ実際の値を確認・変更できます。
            </p>
          </div>
        </div>
      </div>

      {/* フィルター */}
      <CmServiceCredentialsFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* 件数表示 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">
            {entries.length}
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
      <CmServiceCredentialsTable
        entries={entries}
        loading={loading}
        error={error}
        updateError={updateError}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onClearUpdateError={clearUpdateError}
      />

      {/* 登録・編集モーダル */}
      <CmServiceCredentialsModal
        isOpen={isModalOpen}
        entry={editingEntry}
        fullEntry={fullEntry}
        isLoadingEntry={isLoadingEntry}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(null);
          setFullEntry(null);
        }}
        onSave={handleSave}
        isSaving={isSaving}
      />

      {/* 削除確認モーダル */}
      <CmServiceCredentialsDeleteModal
        isOpen={isDeleteModalOpen}
        entry={deletingEntry}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingEntry(null);
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}