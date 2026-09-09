// =============================================================
// src/components/cm-components/admin/CmAlertStatsGrid.tsx
// アラートバッチ管理 - アラート統計グリッド
// =============================================================

"use client";

import React from "react";

type AlertStats = {
  category: string;
  status: string;
  count: number;
};

export function CmAlertStatsGrid({ stats }: { stats: AlertStats[] }) {
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
