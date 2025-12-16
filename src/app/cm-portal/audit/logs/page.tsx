// =============================================================
// src/app/cm-portal/audit/logs/page.tsx
// システムログ管理画面
// =============================================================

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, AlertCircle } from 'lucide-react';

// =============================================================
// 型定義
// =============================================================

type CmLogEntry = {
  id: string;
  timestamp: string;
  level: 'warn' | 'error';
  module: string;
  message: string;
  context: Record<string, unknown> | null;
  trace_id: string | null;
  env: string;
};

type CmPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

type CmApiResponse = {
  ok: boolean;
  logs?: CmLogEntry[];
  pagination?: CmPagination;
  error?: string;
};

// =============================================================
// コンポーネント
// =============================================================

export default function CmAuditLogsPage() {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [logs, setLogs] = useState<CmLogEntry[]>([]);
  const [pagination, setPagination] = useState<CmPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フィルター
  const [filters, setFilters] = useState({
    env: '',
    level: '',
    module: '',
    message: '',
    traceId: '',
    from: '',
    to: '',
  });

  const [page, setPage] = useState(1);

  // ---------------------------------------------------------
  // API 呼び出し
  // ---------------------------------------------------------
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (filters.env) params.set('env', filters.env);
      if (filters.level) params.set('level', filters.level);
      if (filters.module) params.set('module', filters.module);
      if (filters.message) params.set('message', filters.message);
      if (filters.traceId) params.set('traceId', filters.traceId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);

      const res = await fetch(`/api/cm/audit/logs?${params.toString()}`, {
        credentials: 'include',
      });

      const data: CmApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setLogs([]);
        setPagination(null);
        return;
      }

      setLogs(data.logs || []);
      setPagination(data.pagination || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setLogs([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // ---------------------------------------------------------
  // 初回読み込み & フィルター変更時
  // ---------------------------------------------------------
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const handleReset = () => {
    setFilters({
      env: '',
      level: '',
      module: '',
      message: '',
      traceId: '',
      from: '',
      to: '',
    });
    setPage(1);
  };

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">システムログ</h1>
          <p className="text-sm text-slate-500 mt-1">
            warn / error レベルのログを確認できます
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          更新
        </button>
      </div>

      {/* フィルター */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* 環境 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">環境</label>
            <select
              value={filters.env}
              onChange={(e) => handleFilterChange('env', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべて</option>
              <option value="production">production</option>
              <option value="preview">preview</option>
              <option value="development">development</option>
            </select>
          </div>

          {/* レベル */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">レベル</label>
            <select
              value={filters.level}
              onChange={(e) => handleFilterChange('level', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべて</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </div>

          {/* モジュール */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">モジュール</label>
            <input
              type="text"
              value={filters.module}
              onChange={(e) => handleFilterChange('module', e.target.value)}
              placeholder="例: cm/api/clients"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* メッセージ */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">メッセージ</label>
            <input
              type="text"
              value={filters.message}
              onChange={(e) => handleFilterChange('message', e.target.value)}
              placeholder="キーワード検索"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* トレースID */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">トレースID</label>
            <input
              type="text"
              value={filters.traceId}
              onChange={(e) => handleFilterChange('traceId', e.target.value)}
              placeholder="トレースIDで絞り込み"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 日時（From） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">開始日時</label>
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => handleFilterChange('from', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 日時（To） */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">終了日時</label>
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => handleFilterChange('to', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* ボタン */}
          <div className="flex items-end gap-2">
            <button
              onClick={handleSearch}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900"
            >
              <Search className="w-4 h-4" />
              検索
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              リセット
            </button>
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* ログ一覧 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">読み込み中...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">ログがありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">日時</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">レベル</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">環境</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">モジュール</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">メッセージ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">トレースID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          log.level === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {log.level === 'error' ? (
                          <AlertCircle className="w-3 h-3" />
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {log.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{log.env}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">{log.module}</td>
                    <td className="px-4 py-3 text-sm text-slate-800 max-w-md truncate" title={log.message}>
                      {log.message}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                      {log.trace_id ? log.trace_id.slice(0, 8) + '...' : '-'}
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
              全 {pagination.total} 件中 {(pagination.page - 1) * pagination.limit + 1} -{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} 件
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPrev}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.hasNext}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}