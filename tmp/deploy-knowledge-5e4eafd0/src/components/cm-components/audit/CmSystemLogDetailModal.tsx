// =============================================================
// src/components/cm-components/audit/CmSystemLogDetailModal.tsx
// システムログ - ログ詳細モーダル
//
// CmAuditLogTable の各行クリック時に表示。
// context / error_name / error_message / error_stack 等、
// 一覧では表示しきれない詳細情報を確認するためのモーダル。
// =============================================================

'use client';

import React, { useCallback } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type { CmLogEntry } from '@/types/cm/auditLogs';

type Props = {
  log: CmLogEntry;
  onClose: () => void;
};

export function CmSystemLogDetailModal({ log, onClose }: Props) {
  // ---------------------------------------------------------
  // コピー状態管理
  // ---------------------------------------------------------
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const handleCopy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }, []);

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
  // エラー情報の有無
  // ---------------------------------------------------------
  const hasErrorDetail = log.error_name || log.error_message || log.error_stack;

  // ---------------------------------------------------------
  // コンテキストの有無
  // ---------------------------------------------------------
  const hasContext = log.context && Object.keys(log.context).length > 0;

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
                      : 'bg-amber-100 text-amber-700'
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
              {log.trace_id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-slate-600">
                    {log.trace_id}
                  </span>
                  <button
                    onClick={() => handleCopy(log.trace_id!, 'traceId')}
                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    title="コピー"
                  >
                    {copiedField === 'traceId' ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-sm text-slate-400">-</div>
              )}
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

          {/* エラー情報 */}
          {hasErrorDetail && (
            <div className="mb-6">
              <div className="text-xs font-medium text-red-600 uppercase tracking-wide mb-2">
                エラー情報
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg overflow-hidden">
                {/* エラー名 / エラーメッセージ */}
                {(log.error_name || log.error_message) && (
                  <div className="p-3 border-b border-red-200">
                    {log.error_name && (
                      <div className="text-sm font-semibold text-red-800 mb-1">
                        {log.error_name}
                      </div>
                    )}
                    {log.error_message && (
                      <div className="text-sm text-red-700">
                        {log.error_message}
                      </div>
                    )}
                  </div>
                )}
                {/* スタックトレース */}
                {log.error_stack && (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-red-600">
                        スタックトレース
                      </span>
                      <button
                        onClick={() => handleCopy(log.error_stack!, 'stack')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors"
                      >
                        {copiedField === 'stack' ? (
                          <>
                            <Check className="w-3 h-3" />
                            コピー済み
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            コピー
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-red-700 whitespace-pre-wrap break-all overflow-x-auto max-h-64 overflow-y-auto">
                      {log.error_stack}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* コンテキスト */}
          {hasContext && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  コンテキスト
                </span>
                <button
                  onClick={() =>
                    handleCopy(JSON.stringify(log.context, null, 2), 'context')
                  }
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  {copiedField === 'context' ? (
                    <>
                      <Check className="w-3 h-3" />
                      コピー済み
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      コピー
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 overflow-x-auto max-h-64 overflow-y-auto">
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
