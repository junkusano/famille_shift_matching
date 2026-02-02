// =============================================================
// src/components/cm-components/digisigner-webhook/CmDigisignerWebhookLogFilters.tsx
// DigiSigner Webhookログ検索フィルター
// =============================================================

"use client";

import React from "react";
import { Search } from "lucide-react";
import { CmCard } from "@/components/cm-components";
import { CmDateTimeLocalInput } from "@/components/cm-components/common/CmDateTimeLocalInput";
import type { CmDigisignerWebhookLogFilters as CmDigisignerWebhookLogFiltersType } from "@/types/cm/digisignerWebhookLogs";

type Props = {
  filters: CmDigisignerWebhookLogFiltersType;
  onFilterChange: (key: keyof CmDigisignerWebhookLogFiltersType, value: string) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function CmDigisignerWebhookLogFilters({
  filters,
  onFilterChange,
  onSearch,
  onReset,
}: Props) {
  return (
    <CmCard title="検索条件">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* ステータス */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            ステータス
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange("status", e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
          >
            <option value="">すべて</option>
            <option value="received">received（受信済み）</option>
            <option value="processed">processed（処理済み）</option>
            <option value="failed">failed（失敗）</option>
            <option value="rejected">rejected（拒否）</option>
          </select>
        </div>

        {/* イベント */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            イベント
          </label>
          <select
            value={filters.eventType}
            onChange={(e) => onFilterChange("eventType", e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-colors"
          >
            <option value="">すべて</option>
            <option value="SIGNATURE_REQUEST_COMPLETED">
              SIGNATURE_REQUEST_COMPLETED
            </option>
            <option value="DOCUMENT_SIGNED">DOCUMENT_SIGNED</option>
          </select>
        </div>

        {/* 開始日時 */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            開始日時
          </label>
          <CmDateTimeLocalInput
            value={filters.from}
            onChange={(utcValue) => onFilterChange("from", utcValue)}
          />
        </div>

        {/* 終了日時 */}
        <div>
          <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            終了日時
          </label>
          <CmDateTimeLocalInput
            value={filters.to}
            onChange={(utcValue) => onFilterChange("to", utcValue)}
          />
        </div>

        {/* ボタン */}
        <div className="flex items-end gap-2">
          <button
            onClick={onSearch}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-sm font-medium"
          >
            <Search className="w-4 h-4" />
            検索
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            リセット
          </button>
        </div>
      </div>
    </CmCard>
  );
}
