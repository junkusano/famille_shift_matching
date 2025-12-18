// src/components/cm-components/admin/CmAlertBatchPanel.tsx
// CMアラートバッチ管理パネル

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { useCmAlertBatch } from "@/hooks/cm/useCmAlertBatch";
import { supabase } from "@/lib/supabaseClient";

// ============================================================
// 型定義
// ============================================================

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

type AlertStats = {
  category: string;
  status: string;
  count: number;
};

// ============================================================
// メインコンポーネント
// ============================================================

export function CmAlertBatchPanel() {
  const { isRunning, lastResult, error, runBatch, clearResult } = useCmAlertBatch();
  const [batchHistory, setBatchHistory] = useState<BatchRunRecord[]>([]);
  const [alertStats, setAlertStats] = useState<AlertStats[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // バッチ履歴を取得
  const fetchBatchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("cm_alert_batch_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setBatchHistory(data || []);
    } catch (err) {
      console.error("バッチ履歴取得エラー:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // アラート統計を取得
  const fetchAlertStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const { data, error } = await supabase.rpc("cm_get_alert_stats");

      if (error) throw error;
      setAlertStats(data || []);
    } catch (err) {
      console.error("アラート統計取得エラー:", err);
      // RPC関数がない場合は手動集計
      try {
        const { data } = await supabase
          .from("cm_alerts")
          .select("category, status");
        
        if (data) {
          const counts: Record<string, Record<string, number>> = {};
          data.forEach((item) => {
            if (!counts[item.category]) counts[item.category] = {};
            counts[item.category][item.status] = (counts[item.category][item.status] || 0) + 1;
          });
          
          const stats: AlertStats[] = [];
          Object.entries(counts).forEach(([category, statuses]) => {
            Object.entries(statuses).forEach(([status, count]) => {
              stats.push({ category, status, count });
            });
          });
          setAlertStats(stats);
        }
      } catch {
        // 無視
      }
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    fetchBatchHistory();
    fetchAlertStats();
  }, [fetchBatchHistory, fetchAlertStats]);

  // バッチ実行後にリフレッシュ
  useEffect(() => {
    if (lastResult?.ok) {
      fetchBatchHistory();
      fetchAlertStats();
    }
  }, [lastResult, fetchBatchHistory, fetchAlertStats]);

  // バッチ実行ハンドラ
  const handleRunBatch = async () => {
    if (isRunning) return;
    
    const confirmed = window.confirm(
      "アラートバッチを実行しますか？\n\n" +
      "・被保険者証アラートの更新\n" +
      "・担当者未設定アラートの更新\n\n" +
      "通常は毎日06:00に自動実行されます。"
    );
    
    if (confirmed) {
      await runBatch();
    }
  };

  return (
    <div className="space-y-6">
      {/* 手動実行セクション */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Play className="w-5 h-5" />
          手動実行
        </h2>

        <div className="flex items-start gap-4">
          <button
            onClick={handleRunBatch}
            disabled={isRunning}
            className={`
              px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2
              ${isRunning
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
              }
            `}
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                実行中...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                バッチを実行
              </>
            )}
          </button>

          <div className="text-sm text-slate-500">
            <p>手動でアラートバッチを実行します。</p>
            <p className="mt-1">
              自動実行: 毎日 06:00 JST（UTC 21:00）
            </p>
          </div>
        </div>

        {/* 実行結果 */}
        {lastResult && (
          <div className={`mt-4 p-4 rounded-lg ${lastResult.ok ? "bg-green-50" : "bg-red-50"}`}>
            <div className="flex items-center gap-2">
              {lastResult.ok ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <span className={`font-medium ${lastResult.ok ? "text-green-700" : "text-red-700"}`}>
                {lastResult.ok ? "バッチ実行完了" : "バッチ実行失敗"}
              </span>
              <button
                onClick={clearResult}
                className="ml-auto text-sm text-slate-500 hover:text-slate-700"
              >
                閉じる
              </button>
            </div>

            {lastResult.ok && lastResult.stats && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                {Object.entries(lastResult.stats).map(([category, stats]) => (
                  <div key={category} className="bg-white rounded p-3 border border-green-200">
                    <p className="font-medium text-slate-700 capitalize">{category}</p>
                    <div className="mt-2 text-sm text-slate-600 space-y-1">
                      <p>スキャン: {stats.scanned}件</p>
                      <p>作成: {stats.created}件</p>
                      <p>更新: {stats.updated}件</p>
                      <p>解消: {stats.resolved}件</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!lastResult.ok && lastResult.error && (
              <p className="mt-2 text-sm text-red-600">{lastResult.error}</p>
            )}
          </div>
        )}

        {error && !lastResult && (
          <div className="mt-4 p-4 rounded-lg bg-red-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-red-700">{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* アラート統計 */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          アラート統計
          <button
            onClick={fetchAlertStats}
            disabled={isLoadingStats}
            className="ml-auto p-1 hover:bg-slate-100 rounded"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoadingStats ? "animate-spin" : ""}`} />
          </button>
        </h2>

        {isLoadingStats ? (
          <div className="text-center py-8 text-slate-500">読み込み中...</div>
        ) : alertStats.length === 0 ? (
          <div className="text-center py-8 text-slate-500">アラートデータがありません</div>
        ) : (
          <CmAlertStatsGrid stats={alertStats} />
        )}
      </div>

      {/* バッチ実行履歴 */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          実行履歴（直近10件）
          <button
            onClick={fetchBatchHistory}
            disabled={isLoadingHistory}
            className="ml-auto p-1 hover:bg-slate-100 rounded"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoadingHistory ? "animate-spin" : ""}`} />
          </button>
        </h2>

        {isLoadingHistory ? (
          <div className="text-center py-8 text-slate-500">読み込み中...</div>
        ) : batchHistory.length === 0 ? (
          <div className="text-center py-8 text-slate-500">実行履歴がありません</div>
        ) : (
          <CmBatchHistoryTable history={batchHistory} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// サブコンポーネント
// ============================================================

function CmAlertStatsGrid({ stats }: { stats: AlertStats[] }) {
  // カテゴリごとにグループ化
  const grouped = stats.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = {};
    acc[item.category][item.status] = item.count;
    return acc;
  }, {} as Record<string, Record<string, number>>);

  const categoryLabels: Record<string, string> = {
    insurance: "被保険者証",
    no_manager: "担当者未設定",
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    unread: { label: "未読", color: "bg-red-100 text-red-700" },
    read: { label: "確認済", color: "bg-yellow-100 text-yellow-700" },
    applying: { label: "申請中", color: "bg-blue-100 text-blue-700" },
    resolved: { label: "解決", color: "bg-green-100 text-green-700" },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Object.entries(grouped).map(([category, statuses]) => {
        const total = Object.values(statuses).reduce((sum, count) => sum + count, 0);
        const active = (statuses.unread || 0) + (statuses.read || 0) + (statuses.applying || 0);

        return (
          <div key={category} className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-slate-800">
                {categoryLabels[category] || category}
              </h3>
              <span className="text-sm text-slate-500">
                アクティブ: {active} / 全体: {total}
              </span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusLabels).map(([status, { label, color }]) => (
                <span
                  key={status}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${color}`}
                >
                  {label}: {statuses[status] || 0}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CmBatchHistoryTable({ history }: { history: BatchRunRecord[] }) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
                {formatDate(record.started_at)}
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
                        <span className="text-green-600">✓{s.resolved}</span>
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