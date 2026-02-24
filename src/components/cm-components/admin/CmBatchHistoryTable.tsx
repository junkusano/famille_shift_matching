// =============================================================
// src/components/cm-components/admin/CmBatchHistoryTable.tsx
// アラートバッチ管理 - バッチ実行履歴テーブル
// =============================================================

"use client";

import React from "react";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { cmFormatDateTimeLocale } from '@/lib/cm/utils';

type BatchRunRecord = {
  id: string;
  run_type: string;
  triggered_by: string | null;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  stats: Record<string, { scanned: number; created: number; updated: number; resolved: number }>;
};

export function CmBatchHistoryTable({ history }: { history: BatchRunRecord[] }) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            完了
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            <XCircle className="w-3 h-3" />
            失敗
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            <RefreshCw className="w-3 h-3 animate-spin" />
            実行中
          </span>
        );
      default:
        return <span className="text-slate-500">{status}</span>;
    }
  };

  const getRunTypeBadge = (runType: string) => {
    return runType === "manual" ? (
      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
        手動
      </span>
    ) : (
      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
        自動
      </span>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-4 font-medium text-slate-600">実行日時</th>
            <th className="text-left py-3 px-4 font-medium text-slate-600">種別</th>
            <th className="text-left py-3 px-4 font-medium text-slate-600">ステータス</th>
            <th className="text-left py-3 px-4 font-medium text-slate-600">統計</th>
          </tr>
        </thead>
        <tbody>
          {history.map((record) => (
            <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-3 px-4 text-slate-700">
                {cmFormatDateTimeLocale(record.started_at)}
              </td>
              <td className="py-3 px-4">
                {getRunTypeBadge(record.run_type)}
              </td>
              <td className="py-3 px-4">
                {getStatusBadge(record.status)}
              </td>
              <td className="py-3 px-4">
                {record.status === "completed" && record.stats ? (
                  <div className="text-xs text-slate-600">
                    {Object.entries(record.stats).map(([cat, s]) => (
                      <span key={cat} className="mr-3">
                        {cat}: +{s.created} /{" "}
                        <span className="text-green-600">\u2713{s.resolved}</span>
                      </span>
                    ))}
                  </div>
                ) : record.status === "failed" ? (
                  <span className="text-xs text-red-500 truncate max-w-xs block">
                    {record.error_message || "エラー"}
                  </span>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
