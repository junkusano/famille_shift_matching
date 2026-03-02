// =============================================================
// src/components/cm-components/other-offices/CmOtherOfficeTable.tsx
// 他社事業所一覧 - テーブル（FAX代行番号インライン編集機能付き）
// =============================================================

'use client';

import React from 'react';
import {
  Building2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import type { CmOtherOffice, CmOtherOfficePagination } from '@/types/cm/otherOffices';
import { FaxProxyEditCell } from './FaxProxyEditCell';

type Props = {
  offices: CmOtherOffice[];
  pagination: CmOtherOfficePagination | null;
  loading: boolean;
  error: string | null;
  updatingId: number | null;
  updateError: string | null;
  onPageChange: (page: number) => void;
  onUpdateFaxProxy: (id: number, faxProxy: string | null) => Promise<boolean>;
  onClearUpdateError: () => void;
};

export function CmOtherOfficeTable({
  offices,
  pagination,
  loading,
  error,
  updatingId,
  updateError,
  onPageChange,
  onUpdateFaxProxy,
  onClearUpdateError,
}: Props) {
  return (
    <>
      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 更新エラー表示 */}
      {updateError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg flex items-center justify-between">
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

      <CmCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            読み込み中...
          </div>
        ) : offices.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">該当する事業所がありません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                    サービス種別
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                    事業者番号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                    事業所名
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                    サテライト
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                    電話番号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                    FAX
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                    FAX代行
                    <span className="ml-1 text-blue-500 normal-case">(編集可)</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                    住所
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {offices.map((office) => {
                  return (
                    <tr
                      key={office.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      {/* サービス種別 */}
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {office.service_type || '-'}
                      </td>

                      {/* 事業者番号 */}
                      <td className="px-4 py-3 text-sm text-slate-700 font-mono whitespace-nowrap">
                        {office.office_number || '-'}
                      </td>

                      {/* 事業所名 */}
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-800">
                          {office.office_name}
                        </div>
                      </td>

                      {/* サテライト */}
                      <td className="px-4 py-3 text-sm text-slate-600 text-center">
                        {office.is_satellite ? '○' : '-'}
                      </td>

                      {/* 電話番号 */}
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {office.phone || '-'}
                      </td>

                      {/* FAX */}
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                        {office.fax || '-'}
                      </td>

                      {/* FAX代行（編集可能） */}
                      <td className="px-4 py-3">
                        <FaxProxyEditCell
                          office={office}
                          isUpdating={updatingId === office.id}
                          onUpdate={(faxProxy) => onUpdateFaxProxy(office.id, faxProxy)}
                        />
                      </td>

                      {/* 住所 */}
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[250px]">
                        <div className="truncate" title={office.address || ''}>
                          {office.address || '-'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ページネーション */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-500">
              全 {pagination.total.toLocaleString()} 件中{' '}
              {((pagination.page - 1) * pagination.limit + 1).toLocaleString()} -{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total).toLocaleString()} 件
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
                disabled={!pagination.hasPrev}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="前のページ"
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
                aria-label="次のページ"
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