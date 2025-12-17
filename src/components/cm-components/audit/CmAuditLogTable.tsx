// =============================================================
// src/components/cm-components/audit/CmAuditLogTable.tsx
// システムログ一覧テーブル
// =============================================================

'use client';

import React from 'react';
import { AlertTriangle, AlertCircle, ChevronLeft, ChevronRight, FileWarning } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import type { CmLogEntry, CmAuditLogPagination } from '@/types/cm/auditLogs';

type Props = {
  logs: CmLogEntry[];
  pagination: CmAuditLogPagination | null;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
};

export function CmAuditLogTable({
  logs,
  pagination,
  loading,
  error,
  onPageChange,
}: Props) {
  // ---------------------------------------------------------
  // 日時フォーマット
  // ---------------------------------------------------------
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <>
      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <CmCard noPadding>
        {/* ローディング */}
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
            <p className="mt-4 text-slate-500">読み込み中...</p>
          </div>
        ) : logs.length === 0 ? (
          /* 空状態 */
          <div className="p-12 text-center">
            <FileWarning className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">ログがありません</p>
          </div>
        ) : (
          /* テーブル */
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    日時
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    レベル
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    環境
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    モジュール
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    メッセージ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    トレースID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          log.level === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {log.level === 'error' ? (
                          <AlertCircle className="w-3 h-3" />
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {log.level}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          log.env === 'production'
                            ? 'bg-green-100 text-green-700'
                            : log.env === 'preview'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {log.env}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600 font-mono">
                      {log.module}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-800 max-w-md">
                      <div className="truncate" title={log.message}>
                        {log.message}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500 font-mono">
                      {log.trace_id ? (
                        <span title={log.trace_id}>
                          {log.trace_id.slice(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
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
                onClick={() => onPageChange(pagination.page - 1)}
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