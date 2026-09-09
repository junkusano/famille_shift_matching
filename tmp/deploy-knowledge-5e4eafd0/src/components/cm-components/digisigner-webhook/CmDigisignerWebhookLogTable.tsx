// =============================================================
// src/components/cm-components/digisigner-webhook/CmDigisignerWebhookLogTable.tsx
// DigiSigner Webhookログ一覧テーブル
// =============================================================

"use client";

import React from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileWarning,
} from "lucide-react";
import { CmCard } from "@/components/cm-components/ui/CmCard";
import type {
  CmDigisignerWebhookLogEntry,
  CmDigisignerWebhookLogPagination,
} from "@/types/cm/digisignerWebhookLogs";
import { DigiSignerStatusBadge as StatusBadge } from './DigiSignerStatusBadge';
import { EventTypeBadge } from './EventTypeBadge';
import { PayloadCell } from './PayloadCell';

type Props = {
  logs: CmDigisignerWebhookLogEntry[];
  pagination: CmDigisignerWebhookLogPagination | null;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
};

// ---------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------
export function CmDigisignerWebhookLogTable({
  logs,
  pagination,
  loading,
  error,
  onPageChange,
}: Props) {
  // 日時フォーマット
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

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
            <p className="text-slate-500">DigiSigner Webhookログがありません</p>
            <p className="text-sm text-slate-400 mt-1">
              DigiSignerからのWebhook受信がまだありません
            </p>
          </div>
        ) : (
          /* テーブル */
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    受信日時
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    イベント
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Document ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Signature Request ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    処理ステータス
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    処理日時
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    ペイロード
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className={`transition-colors ${
                      log.processing_status === "rejected" ||
                      log.processing_status === "failed"
                        ? "bg-red-50/50 hover:bg-red-50"
                        : "hover:bg-blue-50/50"
                    }`}
                  >
                    {/* 受信日時 */}
                    <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {formatTimestamp(log.created_at)}
                    </td>

                    {/* イベント */}
                    <td className="px-4 py-4">
                      <EventTypeBadge eventType={log.event_type} />
                    </td>

                    {/* Document ID */}
                    <td className="px-4 py-4 text-sm text-slate-500 font-mono">
                      {log.digisigner_document_id ? (
                        <span title={log.digisigner_document_id}>
                          {log.digisigner_document_id.slice(0, 18)}...
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Signature Request ID */}
                    <td className="px-4 py-4 text-sm text-slate-500 font-mono">
                      {log.digisigner_signature_request_id ? (
                        <span title={log.digisigner_signature_request_id}>
                          {log.digisigner_signature_request_id.slice(0, 18)}...
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* 処理ステータス */}
                    <td className="px-4 py-4">
                      <StatusBadge status={log.processing_status} />
                    </td>

                    {/* 処理日時 */}
                    <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {log.processed_at ? (
                        formatTimestamp(log.processed_at)
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* ペイロード */}
                    <td className="px-4 py-4">
                      <PayloadCell payload={log.payload} />
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
              全 {pagination.total.toLocaleString()} 件中{" "}
              {((pagination.page - 1) * pagination.limit + 1).toLocaleString()}{" "}
              -{" "}
              {Math.min(
                pagination.page * pagination.limit,
                pagination.total
              ).toLocaleString()}{" "}
              件
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