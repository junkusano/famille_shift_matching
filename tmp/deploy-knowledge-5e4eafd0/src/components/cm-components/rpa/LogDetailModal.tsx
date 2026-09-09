// =============================================================
// src/components/cm-components/rpa/LogDetailModal.tsx
// RPAログ - ログ詳細モーダル
// =============================================================

'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { CmRpaLogRecord } from '@/types/cm/rpa';

export function LogDetailModal({
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
        </div>

        {/* フッター */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
