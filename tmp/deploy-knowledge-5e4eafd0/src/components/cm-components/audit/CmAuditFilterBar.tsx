// =============================================================
// src/components/cm-components/audit/CmAuditFilterBar.tsx
// 監査ログ閲覧画面のフィルター（カード型）+ 凡例
//
// page.tsx から呼ばれ、フィルター状態の変更を親に通知する
// タブ切替（経路フロー / 一覧）は page.tsx 側で管理する
// =============================================================

"use client";

import React from "react";
import {
  Search,
  RotateCcw,
  FileText,
  Pencil,
} from "lucide-react";
import type { CmAuditLogFilter } from "@/types/cm/operationLog";

// =============================================================
// 型定義
// =============================================================

/** タブ種別 — 経路フローと一覧の2ビュー */
export type CmAuditTab = "flow" | "list";

type Props = {
  filter: CmAuditLogFilter;
  userFilter: string;
  loading: boolean;
  onFilterChange: (patch: Partial<CmAuditLogFilter>) => void;
  onUserFilterChange: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
};

// =============================================================
// サブコンポーネント: 凡例
// =============================================================

function CmAuditLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="flex items-center justify-center w-5 h-5 rounded bg-slate-50 border border-slate-200">
          <FileText size={11} className="text-slate-400" />
        </span>
        ページ閲覧
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-center justify-center w-5 h-5 rounded bg-blue-50 border border-blue-200">
          <Pencil size={11} className="text-blue-600" />
        </span>
        書き込み操作
      </span>
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        操作中（30分以内）
      </span>
      <span className="flex items-center gap-1.5">
        <span className="px-1.5 py-0.5 text-xs rounded-full bg-slate-100 text-slate-400">
          最終操作
        </span>
        セッション終端
      </span>
    </div>
  );
}

// =============================================================
// メインコンポーネント
// =============================================================

export function CmAuditFilterBar({
  filter,
  userFilter,
  loading,
  onFilterChange,
  onUserFilterChange,
  onSearch,
  onReset,
}: Props) {
  return (
    <div className="space-y-4">
      {/* 検索条件カード */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <Search size={14} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">検索条件</span>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 操作者 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
              操作者
            </label>
            <input
              type="text"
              placeholder="名前で検索"
              value={userFilter}
              onChange={(e) => onUserFilterChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
            />
          </div>

          {/* 開始日時 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
              開始日時
            </label>
            <input
              type="datetime-local"
              value={filter.start_date ?? ""}
              onChange={(e) =>
                onFilterChange({ start_date: e.target.value || null })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
            />
          </div>

          {/* 終了日時 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
              終了日時
            </label>
            <input
              type="datetime-local"
              value={filter.end_date ?? ""}
              onChange={(e) =>
                onFilterChange({ end_date: e.target.value || null })
              }
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
            />
          </div>

          {/* 検索・リセットボタン */}
          <div className="flex items-end gap-2">
            <button
              onClick={onSearch}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Search size={14} />
              検索
            </button>
            <button
              onClick={onReset}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={14} />
              リセット
            </button>
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <CmAuditLegend />
    </div>
  );
}