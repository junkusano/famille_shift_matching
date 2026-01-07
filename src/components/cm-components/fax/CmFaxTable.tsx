// =============================================================
// src/components/cm-components/fax/CmFaxTable.tsx
// FAX一覧 - テーブル
// =============================================================

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  FileWarning,
  Check,
  Loader2,
  FileText,
  SortAsc,
  SortDesc,
  ArrowUpDown,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import type {
  CmFaxReceived,
  CmFaxPagination,
  CmFaxSortConfig,
} from '@/types/cm/fax';

type Props = {
  faxList: CmFaxReceived[];
  myAssignedOfficeIds: number[];
  pagination: CmFaxPagination | null;
  sortConfig: CmFaxSortConfig;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
  onSort: (key: CmFaxSortConfig['key']) => void;
};

// =============================================================
// ヘルパー関数
// =============================================================

/** ステータス設定を取得 */
function getStatusConfig(fax: CmFaxReceived) {
  const progress = fax.page_count > 0 ? fax.assigned_page_count / fax.page_count : 0;

  if (progress === 1 && fax.page_count > 0) {
    return { label: '完了', color: 'bg-emerald-100 text-emerald-700', Icon: Check };
  }
  if (fax.status === 'OCR処理中') {
    return { label: 'OCR処理中', color: 'bg-blue-100 text-blue-700', Icon: Loader2 };
  }
  if (fax.assigned_page_count > 0) {
    return { label: '振り分け中', color: 'bg-amber-100 text-amber-700', Icon: FileText };
  }
  return { label: '未処理', color: 'bg-gray-100 text-gray-600', Icon: Clock };
}

/** 日時フォーマット（相対時間） */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'たった今';
  if (diffMinutes < 60) return `${diffMinutes}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;

  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =============================================================
// コンポーネント
// =============================================================

export function CmFaxTable({
  faxList,
  myAssignedOfficeIds,
  pagination,
  sortConfig,
  loading,
  error,
  onPageChange,
  onSort,
}: Props) {
  const router = useRouter();

  /** FAX詳細ページへ遷移 */
  const handleRowClick = (faxId: number) => {
    router.push(`/cm-portal/fax/${faxId}`);
  };

  /** ソートアイコン取得 */
  const getSortIcon = (key: CmFaxSortConfig['key']) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    }
    return sortConfig.direction === 'asc' ? (
      <SortAsc className="w-3.5 h-3.5" />
    ) : (
      <SortDesc className="w-3.5 h-3.5" />
    );
  };

  // ---------------------------------------------------------
  // エラー表示
  // ---------------------------------------------------------
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  // ---------------------------------------------------------
  // メインレンダリング
  // ---------------------------------------------------------
  return (
    <CmCard noPadding>
      {/* ローディング */}
      {loading ? (
        <div className="p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin" />
          <p className="mt-4 text-slate-500">読み込み中...</p>
        </div>
      ) : faxList.length === 0 ? (
        // 空状態
        <div className="py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <FileWarning className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">該当するFAXがありません</p>
          <p className="text-sm text-gray-400 mt-1">
            フィルター条件を変更してください
          </p>
        </div>
      ) : (
        <>
          {/* テーブルヘッダー（PC） */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50/80 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="col-span-3">
              <button
                onClick={() => onSort('officeName')}
                className="flex items-center gap-1 hover:text-gray-700 transition-colors"
              >
                事業所
                {getSortIcon('officeName')}
              </button>
            </div>
            <div className="col-span-2">FAX番号</div>
            <div className="col-span-2">
              <button
                onClick={() => onSort('receivedAt')}
                className="flex items-center gap-1 hover:text-gray-700 transition-colors"
              >
                受信日時
                {getSortIcon('receivedAt')}
              </button>
            </div>
            <div className="col-span-2">
              <button
                onClick={() => onSort('progress')}
                className="flex items-center gap-1 hover:text-gray-700 transition-colors"
              >
                進捗
                {getSortIcon('progress')}
              </button>
            </div>
            <div className="col-span-2">ステータス</div>
            <div className="col-span-1" />
          </div>

          {/* データ行 */}
          <div className="divide-y divide-gray-100">
            {faxList.map((fax) => {
              const statusConfig = getStatusConfig(fax);
              const StatusIcon = statusConfig.Icon;
              const progressPercent =
                fax.page_count > 0
                  ? (fax.assigned_page_count / fax.page_count) * 100
                  : 0;
              const isMyAssigned =
                fax.office_id !== null &&
                myAssignedOfficeIds.includes(fax.office_id);
              const isUnassigned = fax.office_id === null;

              return (
                <div
                  key={fax.id}
                  onClick={() => handleRowClick(fax.id)}
                  className={`grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-4 md:px-5 py-4 hover:bg-gray-50/80 cursor-pointer transition-colors ${
                    isUnassigned ? 'bg-amber-50/30' : ''
                  }`}
                >
                  {/* 事業所 */}
                  <div className="col-span-1 md:col-span-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isUnassigned
                            ? 'bg-amber-100'
                            : isMyAssigned
                            ? 'bg-teal-100'
                            : 'bg-gray-100'
                        }`}
                      >
                        <Building2
                          className={`w-5 h-5 ${
                            isUnassigned
                              ? 'text-amber-600'
                              : isMyAssigned
                              ? 'text-teal-600'
                              : 'text-gray-500'
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className={`font-medium truncate ${
                              isUnassigned ? 'text-amber-700' : 'text-gray-900'
                            }`}
                          >
                            {fax.office_name || '未割当'}
                          </p>
                          {isMyAssigned && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-teal-100 text-teal-700 rounded">
                              担当
                            </span>
                          )}
                          {isUnassigned && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded">
                              要確認
                            </span>
                          )}
                        </div>
                        {fax.candidate_clients &&
                          fax.candidate_clients.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              候補:{' '}
                              {fax.candidate_clients
                                .map((c) => c.name)
                                .join(', ')}
                            </p>
                          )}
                        {/* モバイル用 FAX番号 */}
                        <p className="md:hidden text-xs text-gray-400 mt-1 font-mono">
                          {fax.fax_number}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* FAX番号（PC） */}
                  <div className="hidden md:flex col-span-2 items-center">
                    <span className="text-sm text-gray-600 font-mono">
                      {fax.fax_number}
                    </span>
                  </div>

                  {/* 受信日時 */}
                  <div className="hidden md:flex col-span-2 items-center">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {formatRelativeTime(fax.received_at)}
                    </div>
                  </div>

                  {/* 進捗 */}
                  <div className="col-span-1 md:col-span-2 flex items-center">
                    <div className="w-full max-w-[120px]">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">
                          {fax.assigned_page_count}/{fax.page_count} ページ
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            progressPercent === 100
                              ? 'bg-emerald-500'
                              : progressPercent > 0
                              ? 'bg-teal-500'
                              : 'bg-gray-200'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ステータス */}
                  <div className="col-span-1 md:col-span-2 flex items-center">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${statusConfig.color}`}
                    >
                      <StatusIcon
                        className={`w-3.5 h-3.5 ${
                          statusConfig.label === 'OCR処理中'
                            ? 'animate-spin'
                            : ''
                        }`}
                      />
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* アクション（PC） */}
                  <div className="hidden md:flex col-span-1 items-center justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(fax.id);
                      }}
                      className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </div>

                  {/* モバイル用 受信日時 & 矢印 */}
                  <div className="md:hidden flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      {formatRelativeTime(fax.received_at)}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ページネーション */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 bg-gray-50/50">
              <p className="text-sm text-gray-500">
                {pagination.total}件中{' '}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total
                )}
                件を表示
              </p>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => onPageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrev}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* ページ番号ボタン */}
                {Array.from(
                  { length: Math.min(5, pagination.totalPages) },
                  (_, i) => {
                    let pageNum: number;
                    const total = pagination.totalPages;
                    const current = pagination.page;

                    if (total <= 5) {
                      pageNum = i + 1;
                    } else if (current <= 3) {
                      pageNum = i + 1;
                    } else if (current >= total - 2) {
                      pageNum = total - 4 + i;
                    } else {
                      pageNum = current - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => onPageChange(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                          pagination.page === pageNum
                            ? 'bg-teal-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                )}

                <button
                  onClick={() => onPageChange(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </CmCard>
  );
}
