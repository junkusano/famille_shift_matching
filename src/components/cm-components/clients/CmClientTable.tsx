// =============================================================
// src/components/cm-components/clients/CmClientTable.tsx
// 利用者一覧 - テーブル
// =============================================================

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Users, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import {
  cmFormatAddress,
  cmCalculateAge,
  cmGetCareLevelDisplay,
} from '@/lib/cm/utils';
import type { CmClientInfo, CmPagination } from '@/types/cm/clients';

type Props = {
  clients: CmClientInfo[];
  pagination: CmPagination | null;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
};

export function CmClientTable({
  clients,
  pagination,
  loading,
  error,
  onPageChange,
}: Props) {
  const router = useRouter();

  const handleSelectClient = (client: CmClientInfo) => {
    router.push(`/cm-portal/clients/${client.kaipoke_cs_id}`);
  };

  return (
    <>
      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <CmCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500">読み込み中...</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">該当する利用者がありません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    氏名
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    性別
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    生年月日
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    要介護度
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    住所
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    電話番号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    契約日
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    状態
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {clients.map((client) => {
                  const careLevelDisplay = cmGetCareLevelDisplay(client.insurances);
                  const age = cmCalculateAge(client.birth_date);

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleSelectClient(client)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{client.name}</div>
                        <div className="text-xs text-slate-400">{client.kana}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {client.gender ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-600">
                          {client.birth_date ?? '-'}
                        </div>
                        {age && <div className="text-xs text-slate-400">{age}歳</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${careLevelDisplay.style}`}
                        >
                          {careLevelDisplay.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                        {cmFormatAddress(client) || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {client.phone_01 ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {client.contract_date ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            client.client_status === '利用中'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              client.client_status === '利用中'
                                ? 'bg-green-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          {client.client_status ?? '不明'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectClient(client);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          詳細 →
                        </button>
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
              全 {pagination.total} 件中 {(pagination.page - 1) * pagination.limit + 1} -{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} 件
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
                disabled={!pagination.hasPrev}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={!pagination.hasNext}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
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