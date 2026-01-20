// =============================================================
// src/components/cm-components/rpa/CmRpaLogTable.tsx
// RPAログ一覧テーブル
// =============================================================

'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Info,
  Bug,
  X,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import type { CmRpaLogRecord } from '@/types/cm/rpa';
import type { CmRpaLogPagination } from '@/types/cm/rpaLogs';

type Props = {
  logs: CmRpaLogRecord[];
  pagination: CmRpaLogPagination | null;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
};

export function CmRpaLogTable({
  logs,
  pagination,
  loading,
  error,
  onPageChange,
}: Props) {
  const [selectedLog, setSelectedLog] = useState<CmRpaLogRecord | null>(null);

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
  // レベルアイコン・スタイル
  // ---------------------------------------------------------
  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-3 h-3" />;
      case 'warn':
        return <AlertTriangle className="w-3 h-3" />;
      case 'info':
        return <Info className="w-3 h-3" />;
      case 'debug':
        return <Bug className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getLevelStyle = (level: string) => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-700';
      case 'warn':
        return 'bg-amber-100 text-amber-700';
      case 'info':
        return 'bg-blue-100 text-blue-700';
      case 'debug':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  const getEnvStyle = (env: string) => {
    switch (env) {
      case 'production':
        return 'bg-green-100 text-green-700';
      case 'preview':
        return 'bg-purple-100 text-purple-700';
      case 'development':
        return 'bg-slate-100 text-slate-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
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
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getLevelStyle(log.level)}`}
                      >
                        {getLevelIcon(log.level)}
                        {log.level}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getEnvStyle(log.env)}`}
                      >
                        {log.env}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600 font-mono">
                      {log.module}
                      {log.action && (
                        <span className="text-slate-400 ml-1">/ {log.action}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-800 max-w-md">
                      <div className="truncate" title={log.message}>
                        {log.message}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500 font-mono">
                      {log.trace_id ? (
                        <span title={log.trace_id}>
                          {log.trace_id.slice(0, 12)}...
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

      {/* 詳細モーダル */}
      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </>
  );
}

// =============================================================
// ログ詳細モーダル
// =============================================================

function LogDetailModal({
  log,
  onClose,
}: {
  log: CmRpaLogRecord;
  onClose: () => void;
}) {
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

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-lg font-semibold text-slate-800">ログ詳細</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-130px)]">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                タイムスタンプ
              </div>
              <div className="text-sm font-mono text-slate-800">
                {formatTimestamp(log.timestamp)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                レベル / 環境
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    log.level === 'error'
                      ? 'bg-red-100 text-red-700'
                      : log.level === 'warn'
                      ? 'bg-amber-100 text-amber-700'
                      : log.level === 'info'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {log.level}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    log.env === 'production'
                      ? 'bg-green-100 text-green-700'
                      : log.env === 'preview'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {log.env}
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                モジュール
              </div>
              <div className="text-sm font-mono text-slate-800">{log.module}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                アクション
              </div>
              <div className="text-sm font-mono text-slate-800">
                {log.action || '-'}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                トレースID
              </div>
              <div className="text-sm font-mono text-slate-600">
                {log.trace_id || '-'}
              </div>
            </div>
          </div>

          {/* メッセージ */}
          <div className="mb-6">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              メッセージ
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-800">
              {log.message}
            </div>
          </div>

          {/* コンテキスト */}
          {log.context && Object.keys(log.context).length > 0 && (
            <div className="mb-6">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                コンテキスト
              </div>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 overflow-x-auto">
                {JSON.stringify(log.context, null, 2)}
              </pre>
            </div>
          )}

          {/* エラー情報 */}
          {log.error_name && (
            <div className="mb-6">
              <div className="text-xs font-medium text-red-500 uppercase tracking-wide mb-2">
                エラー情報
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm font-mono font-medium text-red-700">
                    {log.error_name}
                  </span>
                  {log.error_message && (
                    <span className="text-sm text-red-600">{log.error_message}</span>
                  )}
                </div>
                {log.error_stack && (
                  <pre className="text-xs font-mono text-red-500/80 whitespace-pre-wrap mt-2">
                    {log.error_stack}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
