// =============================================================
// src/app/cm-portal/audit/page.tsx
// 監査ログ閲覧画面
//
// 2ビュー構成:
//   1. 経路フロー — セッション単位の横方向フロー表示
//   2. 一覧       — page_views + operation_logs の統合テーブル
//
// データ取得:
//   両ビューとも cmGetTimeline で取得した統合データを使用する。
//   経路フロー → sessions をそのまま表示
//   一覧       → sessions 内の events をフラットにして時系列ソート
// =============================================================

"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Shield, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cmGetTimeline } from "@/lib/cm/audit/getTimeline";
import {
  CmAuditFilterBar,
  type CmAuditTab,
} from "@/components/cm-components/audit/CmAuditFilterBar";
import { CmAuditFlowView } from "@/components/cm-components/audit/CmAuditFlowView";
import { CmAuditListView } from "@/components/cm-components/audit/CmAuditListView";
import type {
  CmAuditLogFilter,
  CmAuditSession,
  CmTimelineEvent,
} from "@/types/cm/operationLog";

// =============================================================
// 定数
// =============================================================

const CM_AUDIT_DEFAULT_PER_PAGE = 50;

const CM_AUDIT_INITIAL_FILTER: CmAuditLogFilter = {
  start_date: null,
  end_date: null,
  user_id: null,
  category: null,
  table_name: null,
  operation: null,
  record_id: null,
  page: 1,
  per_page: CM_AUDIT_DEFAULT_PER_PAGE,
};

const CM_AUDIT_TAB_CONFIG: { key: CmAuditTab; label: string }[] = [
  { key: "flow", label: "経路フロー" },
  { key: "list", label: "一覧" },
];

// =============================================================
// ユーティリティ
// =============================================================

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

// =============================================================
// メインページコンポーネント
// =============================================================

export default function CmAuditPage() {
  // フィルター状態
  const [filter, setFilter] = useState<CmAuditLogFilter>(CM_AUDIT_INITIAL_FILTER);
  const [userFilter, setUserFilter] = useState("");
  const [activeTab, setActiveTab] = useState<CmAuditTab>("flow");
  const [loading, setLoading] = useState(false);

  // タイムライン統合データ
  const [sessions, setSessions] = useState<CmAuditSession[]>([]);

  // ----------------------------------------------------------
  // 操作者名でクライアント側フィルタリング
  // ----------------------------------------------------------
  const filteredSessions = useMemo<CmAuditSession[]>(() => {
    if (!userFilter) return sessions;
    const q = userFilter.toLowerCase();
    return sessions.filter((s) => {
      const name = s.user_name ?? "";
      const email = s.user_email ?? "";
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
  }, [sessions, userFilter]);

  // ----------------------------------------------------------
  // sessions から全イベントをフラット化（一覧ビュー用）
  // ----------------------------------------------------------
  const flatEvents = useMemo<CmTimelineEvent[]>(() => {
    const events: CmTimelineEvent[] = [];
    for (const session of filteredSessions) {
      for (const ev of session.events) {
        events.push(ev);
      }
    }
    // 時系列降順（新しい順）
    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return events;
  }, [filteredSessions]);

  // ----------------------------------------------------------
  // データ取得
  // ----------------------------------------------------------

  const fetchData = useCallback(async (currentFilter: CmAuditLogFilter) => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const result = await cmGetTimeline(currentFilter, token);
      if (result.ok) {
        setSessions(result.sessions);
      } else {
        console.error("[CmAuditPage] タイムライン取得エラー:", result.error);
      }
    } catch (error) {
      console.error("[CmAuditPage] 予期せぬエラー:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    fetchData(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------
  // イベントハンドラ
  // ----------------------------------------------------------

  const handleFilterChange = useCallback(
    (patch: Partial<CmAuditLogFilter>) => {
      setFilter((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const handleSearch = useCallback(() => {
    const resetFilter = { ...filter, page: 1 };
    setFilter(resetFilter);
    fetchData(resetFilter);
  }, [filter, fetchData]);

  const handleReset = useCallback(() => {
    setFilter(CM_AUDIT_INITIAL_FILTER);
    setUserFilter("");
    fetchData(CM_AUDIT_INITIAL_FILTER);
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData(filter);
  }, [filter, fetchData]);

  // ----------------------------------------------------------
  // レンダリング
  // ----------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ページヘッダー */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">
                監査ログ
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                誰が・何を見て・何をしたかを追跡します
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            更新
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">
        {/* フィルター + 凡例 */}
        <CmAuditFilterBar
          filter={filter}
          userFilter={userFilter}
          loading={loading}
          onFilterChange={handleFilterChange}
          onUserFilterChange={setUserFilter}
          onSearch={handleSearch}
          onReset={handleReset}
        />

        {/* ビュー切替（ピルタブ） */}
        <div
          className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 shadow-sm"
          style={{ width: "fit-content" }}
        >
          {CM_AUDIT_TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* メインコンテンツ */}
        {activeTab === "flow" && (
          <CmAuditFlowView sessions={filteredSessions} loading={loading} />
        )}
        {activeTab === "list" && (
          <CmAuditListView events={flatEvents} loading={loading} />
        )}
      </div>
    </div>
  );
}