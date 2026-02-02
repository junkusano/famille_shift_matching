// =============================================================
// src/components/cm-components/digisigner-webhook/CmDigisignerWebhookLogTable.tsx
// DigiSigner Webhookログ一覧テーブル
// =============================================================

"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { CmCard } from "@/components/cm-components";
import type {
  CmDigisignerWebhookLogEntry,
  CmDigisignerWebhookLogPagination,
} from "@/types/cm/digisignerWebhookLogs";

type Props = {
  logs: CmDigisignerWebhookLogEntry[];
  pagination: CmDigisignerWebhookLogPagination | null;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
};

// ---------------------------------------------------------
// ステータスバッジ
// ---------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    received: "bg-amber-100 text-amber-700",
    processed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    rejected: "bg-pink-100 text-pink-700",
  };
  const style = styles[status] || "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------
// イベントタイプバッジ
// ---------------------------------------------------------
function EventTypeBadge({ eventType }: { eventType: string }) {
  const styles: Record<string, string> = {
    SIGNATURE_REQUEST_COMPLETED: "bg-purple-100 text-purple-700",
    DOCUMENT_SIGNED: "bg-sky-100 text-sky-700",
  };
  const style = styles[eventType] || "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${style}`}
    >
      {eventType}
    </span>
  );
}

// ---------------------------------------------------------
// ペイロード展開セル
// ---------------------------------------------------------
function PayloadCell({ payload }: { payload: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const jsonStr = JSON.stringify(payload, null, 2);
  const preview = JSON.stringify(payload).slice(0, 40) + "...";

  return (
    <div>
      <div className="text-xs text-slate-400 font-mono truncate max-w-[200px]">
        {preview}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-500 hover:text-blue-700 hover:underline mt-0.5 flex items-center gap-0.5"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-3 h-3" />
            閉じる
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" />
            詳細を見る
          </>
        )}
      </button>
      {expanded && (
        <pre className="mt-2 p-3 bg-slate-800 text-slate-200 rounded-lg text-xs font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
          {jsonStr}
        </pre>
      )}
    </div>
  );
}

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
