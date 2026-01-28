// =============================================================
// src/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookPageContent.tsx
// ローカルFAX電話帳管理のClient Component
// =============================================================

"use client";

import React, { useState, useCallback, useTransition, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Plus, CloudDownload, FileText } from "lucide-react";
import { CmLocalFaxPhonebookFilters } from "@/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookFilters";
import { CmLocalFaxPhonebookTable } from "@/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookTable";
import { CmLocalFaxPhonebookModal } from "@/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookModal";
import { CmDeleteConfirmModal } from "@/components/cm-components/local-fax-phonebook/CmDeleteConfirmModal";
import { CmSyncResultModal } from "@/components/cm-components/local-fax-phonebook/CmSyncResultModal";
import {
  createLocalFaxPhonebookEntry,
  updateLocalFaxPhonebookEntry,
  deleteLocalFaxPhonebookEntry,
  checkKaipokeByFaxNumber,
  syncLocalFaxPhonebookWithXml,
} from "@/lib/cm/local-fax-phonebook/actions";
import type {
  CmLocalFaxPhonebookPagination,
  CmLocalFaxPhonebookSyncResult,
  CmKaipokeOfficeInfo,
  CmLocalFaxPhonebookEntryWithKaipoke,
  CmLocalFaxPhonebookSearchFilters,
} from "@/types/cm/localFaxPhonebook";

type Props = {
  entries: CmLocalFaxPhonebookEntryWithKaipoke[];
  pagination: CmLocalFaxPhonebookPagination;
  initialFilters: CmLocalFaxPhonebookSearchFilters;
};

export function CmLocalFaxPhonebookPageContent({
  entries: initialEntries,
  pagination,
  initialFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ローカルのエントリリスト（楽観的更新用）
  const [entries, setEntries] = useState<CmLocalFaxPhonebookEntryWithKaipoke[]>(initialEntries);

  // ローカルのフィルター状態
  const [filters, setFilters] = useState<CmLocalFaxPhonebookSearchFilters>(initialFilters);

  // 更新状態
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // 同期状態
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<CmLocalFaxPhonebookSyncResult | null>(null);

  // カイポケチェック状態
  const [checkingKaipoke, setCheckingKaipoke] = useState(false);
  const [kaipokeCheckResult, setKaipokeCheckResult] = useState<CmKaipokeOfficeInfo[]>([]);
  const kaipokeCheckDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CmLocalFaxPhonebookEntryWithKaipoke | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<CmLocalFaxPhonebookEntryWithKaipoke | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isSyncResultModalOpen, setIsSyncResultModalOpen] = useState(false);

  // propsが変わったらローカル状態を更新
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (kaipokeCheckDebounceRef.current) {
        clearTimeout(kaipokeCheckDebounceRef.current);
      }
    };
  }, []);

  // URLを更新してServer Componentを再レンダリング
  const updateUrl = useCallback(
    (newParams: Record<string, string | number | boolean>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(newParams).forEach(([key, value]) => {
        if (value === "" || value === false || value === 0) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  // フィルター変更
  const handleFilterChange = useCallback((key: keyof CmLocalFaxPhonebookSearchFilters, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 検索実行
  const handleSearch = useCallback(() => {
    updateUrl({
      page: 1,
      name: filters.name,
      faxNumber: filters.faxNumber,
      showInactive: filters.showInactive,
    });
  }, [filters, updateUrl]);

  // リセット
  const handleReset = useCallback(() => {
    const defaultFilters: CmLocalFaxPhonebookSearchFilters = {
      name: "",
      faxNumber: "",
      showInactive: false,
    };
    setFilters(defaultFilters);
    updateUrl({ page: 1, name: "", faxNumber: "", showInactive: false });
  }, [updateUrl]);

  // ページ変更
  const handlePageChange = useCallback(
    (newPage: number) => {
      updateUrl({ page: newPage });
    },
    [updateUrl]
  );

  // 更新
  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // カイポケチェック（デバウンス付き）
  const checkKaipokeDebounced = useCallback((faxNumber: string) => {
    if (kaipokeCheckDebounceRef.current) {
      clearTimeout(kaipokeCheckDebounceRef.current);
    }

    kaipokeCheckDebounceRef.current = setTimeout(async () => {
      if (!faxNumber || faxNumber.replace(/[^0-9]/g, "").length < 4) {
        setKaipokeCheckResult([]);
        return;
      }

      setCheckingKaipoke(true);
      try {
        const result = await checkKaipokeByFaxNumber(faxNumber);
        if (result.ok === true && result.data) {
          setKaipokeCheckResult(result.data);
        } else {
          setKaipokeCheckResult([]);
        }
      } catch {
        setKaipokeCheckResult([]);
      } finally {
        setCheckingKaipoke(false);
      }
    }, 300);
  }, []);

  // カイポケチェック結果クリア
  const clearKaipokeCheckResult = useCallback(() => {
    setKaipokeCheckResult([]);
  }, []);

  // エラークリア
  const clearUpdateError = useCallback(() => {
    setUpdateError(null);
  }, []);

  // 同期結果クリア
  const clearSyncResult = useCallback(() => {
    setSyncResult(null);
  }, []);

  // ハンドラー: 新規登録
  const handleAdd = useCallback(() => {
    setEditingEntry(null);
    setIsModalOpen(true);
  }, []);

  // ハンドラー: 編集
  const handleEdit = useCallback((entry: CmLocalFaxPhonebookEntryWithKaipoke) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  }, []);

  // ハンドラー: 保存（Server Action使用）
  const handleSave = useCallback(
    async (data: {
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
          const result = await updateLocalFaxPhonebookEntry(editingEntry.id, data);
          if (result.ok === true) {
            setIsModalOpen(false);
            setEditingEntry(null);
            refresh();
            return { ok: true };
          }
          return { ok: false, error: result.error };
        } else {
          // 新規作成
          const result = await createLocalFaxPhonebookEntry(data);
          if (result.ok === true) {
            setIsModalOpen(false);
            refresh();
            return { ok: true };
          }
          return { ok: false, error: result.error };
        }
      } finally {
        setIsSaving(false);
      }
    },
    [editingEntry, refresh]
  );

  // ハンドラー: 削除確認
  const handleDelete = useCallback((entry: CmLocalFaxPhonebookEntryWithKaipoke) => {
    setDeletingEntry(entry);
    setIsDeleteModalOpen(true);
  }, []);

  // ハンドラー: 削除実行（Server Action使用）
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingEntry) return;
    setIsDeleting(true);
    try {
      const result = await deleteLocalFaxPhonebookEntry(deletingEntry.id);
      if (result.ok === true) {
        setIsDeleteModalOpen(false);
        setDeletingEntry(null);
        // ローカルステートから削除
        setEntries((prev) => prev.filter((e) => e.id !== deletingEntry.id));
      } else {
        setUpdateError(result.error);
      }
    } finally {
      setIsDeleting(false);
    }
  }, [deletingEntry]);

  // ハンドラー: フィールド更新（インライン編集用）
  const handleUpdateField = useCallback(
    async (id: number, field: string, value: string | boolean | null): Promise<boolean> => {
      setUpdatingId(id);
      setUpdateError(null);
      try {
        const result = await updateLocalFaxPhonebookEntry(id, { [field]: value });
        if (result.ok === false){
          setUpdateError(result.error);
          return false;
        }
        refresh();
        return true;
      } catch (e) {
        setUpdateError(e instanceof Error ? e.message : "通信エラー");
        return false;
      } finally {
        setUpdatingId(null);
      }
    },
    [refresh]
  );

  // ハンドラー: XML同期（Server Action使用）
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncLocalFaxPhonebookWithXml();
      if (result.ok === true && result.data) {
        setSyncResult(result.data);
        setIsSyncResultModalOpen(true);
        refresh();
      } else {
        setSyncResult({
          ok: false,
          summary: { xmlOnly: 0, dbOnly: 0, different: 0, duration: 0 },
          log: [],
          error: result.ok === false ? result.error : "データの取得に失敗しました",
        });
        setIsSyncResultModalOpen(true);
      }
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  // ハンドラー: 同期結果モーダルを閉じる
  const handleCloseSyncResult = useCallback(() => {
    setIsSyncResultModalOpen(false);
    clearSyncResult();
  }, [clearSyncResult]);

  // フィルター適用中かどうか
  const isFiltered =
    filters.name !== "" || filters.faxNumber !== "" || filters.showInactive !== false;

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
            <CloudDownload className={`w-4 h-4 ${syncing ? "animate-pulse" : ""}`} />
            {syncing ? "同期中..." : "XML同期"}
          </button>
          <button
            onClick={refresh}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm font-medium bg-white"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin" : ""}`} />
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
            {pagination.total.toLocaleString()}
          </span>{" "}
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
      <CmLocalFaxPhonebookTable
        entries={entries}
        pagination={pagination}
        loading={isPending}
        error={null}
        updatingId={updatingId}
        updateError={updateError}
        onPageChange={handlePageChange}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onUpdateField={handleUpdateField}
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