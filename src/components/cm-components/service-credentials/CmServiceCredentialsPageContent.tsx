// =============================================================
// src/components/cm-components/service-credentials/CmServiceCredentialsPageContent.tsx
// サービス認証情報管理のClient Component
// =============================================================

'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, Plus, ShieldCheck } from 'lucide-react';
import { CmServiceCredentialsFilters } from '@/components/cm-components/service-credentials/CmServiceCredentialsFilters';
import { CmServiceCredentialsTable } from '@/components/cm-components/service-credentials/CmServiceCredentialsTable';
import { CmServiceCredentialsModal } from '@/components/cm-components/service-credentials/CmServiceCredentialsModal';
import { CmServiceCredentialsDeleteModal } from '@/components/cm-components/service-credentials/CmServiceCredentialsDeleteModal';
import {
  fetchServiceCredential,
  createServiceCredential,
  updateServiceCredential,
  deleteServiceCredential,
} from '@/lib/cm/service-credentials/actions';
import type {
  CmServiceCredential,
  CmServiceCredentialMasked,
} from '@/types/cm/serviceCredentials';

// フィルター型
type Filters = {
  serviceName: string;
  showInactive: boolean;
};

type Props = {
  entries: CmServiceCredentialMasked[];
  initialFilters: Filters;
};

export function CmServiceCredentialsPageContent({ entries, initialFilters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ローカルのフィルター状態
  const [filters, setFilters] = useState<Filters>(initialFilters);

  // エラー状態
  const [updateError, setUpdateError] = useState<string | null>(null);

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CmServiceCredentialMasked | null>(null);
  const [fullEntry, setFullEntry] = useState<CmServiceCredential | null>(null);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<CmServiceCredentialMasked | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // URLを更新してServer Componentを再レンダリング
  const updateUrl = useCallback((newParams: Record<string, string | boolean>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(newParams).forEach(([key, value]) => {
      if (value === '' || value === false) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }, [router, searchParams]);

  // フィルター変更
  const handleFilterChange = useCallback((key: keyof Filters, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 検索実行
  const handleSearch = useCallback(() => {
    updateUrl({
      serviceName: filters.serviceName,
      showInactive: filters.showInactive,
    });
  }, [filters, updateUrl]);

  // リセット
  const handleReset = useCallback(() => {
    const defaultFilters = { serviceName: '', showInactive: false };
    setFilters(defaultFilters);
    updateUrl(defaultFilters);
  }, [updateUrl]);

  // 更新
  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // エラークリア
  const clearUpdateError = useCallback(() => {
    setUpdateError(null);
  }, []);

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

    // 完全なエントリを取得（Server Action）
    setIsLoadingEntry(true);
    const result = await fetchServiceCredential(entry.id);
    if (result.ok && result.data) {
      setFullEntry(result.data);
    } else {
      setUpdateError(result.ok ? 'データ取得に失敗しました' : result.error);
    }
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
        const result = await updateServiceCredential(editingEntry.id, data);
        if (result.ok) {
          setIsModalOpen(false);
          setEditingEntry(null);
          setFullEntry(null);
          refresh();
        }
        return { ok: result.ok, error: result.ok ? undefined : result.error };
      } else {
        // 新規作成
        const result = await createServiceCredential(data);
        if (result.ok) {
          setIsModalOpen(false);
          refresh();
        }
        return { ok: result.ok, error: result.ok ? undefined : result.error };
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
      const result = await deleteServiceCredential(deletingEntry.id);
      if (result.ok) {
        setIsDeleteModalOpen(false);
        setDeletingEntry(null);
        refresh();
      } else {
        setUpdateError(result.error);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // フィルター適用中かどうか
  const isFiltered = filters.serviceName !== '' || filters.showInactive !== false;

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
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm font-medium bg-white"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
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
        {isPending && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-medium">
            読み込み中...
          </span>
        )}
      </div>

      {/* テーブル */}
      <CmServiceCredentialsTable
        entries={entries}
        loading={isPending}
        error={null}
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
