// =============================================================
// src/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookTable.tsx
// ローカルFAX電話帳 - テーブル（カイポケ連携表示・インライン編集機能付き）
// =============================================================

'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import type {
  CmLocalFaxPhonebookPagination,
  CmLocalFaxPhonebookEntryWithKaipoke,
} from '@/types/cm/localFaxPhonebook';
import { KaipokePopover } from './KaipokePopover';
import { InlineEditCell } from './InlineEditCell';

type Props = {
  entries: CmLocalFaxPhonebookEntryWithKaipoke[];
  pagination: CmLocalFaxPhonebookPagination | null;
  loading: boolean;
  error: string | null;
  updatingId: number | null;
  updateError: string | null;
  onPageChange: (page: number) => void;
  onEdit: (entry: CmLocalFaxPhonebookEntryWithKaipoke) => void;
  onDelete: (entry: CmLocalFaxPhonebookEntryWithKaipoke) => void;
  onUpdateField: (id: number, field: string, value: string | null) => Promise<boolean>;
  onClearUpdateError: () => void;
};

export function CmLocalFaxPhonebookTable({
  entries,
  pagination,
  loading,
  error,
  updatingId,
  updateError,
  onPageChange,
  onEdit,
  onDelete,
  onUpdateField,
  onClearUpdateError,
}: Props) {
  // 開いているポップオーバーのID
  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);

  // エラー表示
  const renderError = () => {
    if (!error && !updateError) return null;

    return (
      <div className="mb-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}
        {updateError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {updateError}
            </div>
            <button
              onClick={onClearUpdateError}
              className="text-amber-600 hover:text-amber-800 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ローディング表示
  if (loading) {
    return (
      <>
        {renderError()}
        <CmCard noPadding>
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            読み込み中...
          </div>
        </CmCard>
      </>
    );
  }

  // 空状態
  if (entries.length === 0) {
    return (
      <>
        {renderError()}
        <CmCard noPadding>
          <div className="p-8 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">登録されたエントリがありません</p>
            <p className="text-sm text-slate-400 mt-1">
              「新規登録」ボタンから追加してください
            </p>
          </div>
        </CmCard>
      </>
    );
  }

  return (
    <>
      {renderError()}
      <CmCard noPadding>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  事業所名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  読み仮名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  FAX番号
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  備考{' '}
                  <span className="text-blue-500 normal-case">(編集可)</span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entries.map((entry) => {
                const hasKaipoke = entry.kaipoke_offices && entry.kaipoke_offices.length > 0;
                
                return (
                  <tr
                    key={entry.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      !entry.is_active
                        ? 'bg-slate-50/50 opacity-70'
                        : hasKaipoke
                        ? 'bg-green-50 hover:bg-green-100'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono whitespace-nowrap">
                      {entry.source_id || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-800">
                        {entry.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {entry.name_kana || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-700 font-mono whitespace-nowrap">
                          {entry.fax_number || '-'}
                        </span>
                        {hasKaipoke && (
                          <KaipokePopover
                            offices={entry.kaipoke_offices}
                            isOpen={openPopoverId === entry.id}
                            onToggle={() => {
                              setOpenPopoverId(openPopoverId === entry.id ? null : entry.id);
                            }}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <InlineEditCell
                        value={entry.notes}
                        onSave={(newValue) =>
                          onUpdateField(entry.id, 'notes', newValue)
                        }
                        isUpdating={updatingId === entry.id}
                        placeholder="備考を入力"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {entry.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          有効
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          無効
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onEdit(entry)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                          title="編集"
                        >
                          <Pencil className="w-3 h-3" />
                          編集
                        </button>
                        <button
                          onClick={() => onDelete(entry)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3 h-3" />
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ページネーション */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-500">
              全 {pagination.total.toLocaleString()} 件中{' '}
              {((pagination.page - 1) * pagination.limit + 1).toLocaleString()} -{' '}
              {Math.min(
                pagination.page * pagination.limit,
                pagination.total
              ).toLocaleString()}{' '}
              件
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
                disabled={!pagination.hasPrev}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600 min-w-[80px] text-center">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={!pagination.hasNext}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </CmCard>
    </>
  );
}