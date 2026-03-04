// =============================================================
// src/components/cm-components/audit/CmAuditFlowPage.tsx
// 経路フローページの Client Component
// /cm-portal/audit/flow のメインコンテンツ
//
// 概要:
//   cmGetTimeline で取得したタイムライン統合データを
//   CmAuditFlowView（セッション単位の横方向フロー）で表示する。
//
// 既存コンポーネントの再利用:
//   - CmAuditFilterBar: フィルター条件カード + 凡例
//   - CmAuditFlowView: セッションカード単位の経路フロー表示
// =============================================================

'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, GitBranch } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { cmGetTimeline } from '@/lib/cm/audit/getTimeline';
import {
  CmAuditFilterBar,
} from '@/components/cm-components/audit/CmAuditFilterBar';
import { CmAuditFlowView } from '@/components/cm-components/audit/CmAuditFlowView';
import type {
  CmAuditLogFilter,
  CmAuditSession,
} from '@/types/cm/operationLog';

// =============================================================
// 定数
// =============================================================

const CM_AUDIT_FLOW_DEFAULT_PER_PAGE = 50;

const CM_AUDIT_FLOW_INITIAL_FILTER: CmAuditLogFilter = {
  start_date: null,
  end_date: null,
  user_id: null,
  category: null,
  table_name: null,
  operation: null,
  record_id: null,
  page: 1,
  per_page: CM_AUDIT_FLOW_DEFAULT_PER_PAGE,
};

// =============================================================
// ユーティリティ
// =============================================================

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

// =============================================================
// メインコンポーネント
// =============================================================

export function CmAuditFlowPage() {
  // フィルター状態
  const [filter, setFilter] = useState<CmAuditLogFilter>(CM_AUDIT_FLOW_INITIAL_FILTER);
  const [userFilter, setUserFilter] = useState('');
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
      const name = s.user_name ?? '';
      const email = s.user_email ?? '';
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
  }, [sessions, userFilter]);

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
        console.error('[CmAuditFlowPage] タイムライン取得エラー:', result.error);
      }
    } catch (error) {
      console.error('[CmAuditFlowPage] 予期せぬエラー:', error);
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
    setFilter(CM_AUDIT_FLOW_INITIAL_FILTER);
    setUserFilter('');
    fetchData(CM_AUDIT_FLOW_INITIAL_FILTER);
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
            <Link
              href="/cm-portal/audit"
              className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <ArrowLeft size={16} className="text-slate-600" />
            </Link>
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <GitBranch size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">
                経路フロー
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                セッション単位の操作経路を可視化
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
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

        {/* 経路フロー表示 */}
        <CmAuditFlowView sessions={filteredSessions} loading={loading} />
      </div>
    </div>
  );
}