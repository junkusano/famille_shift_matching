// src/app/cm-portal/admin/alert-batch/page.tsx
// CMアラートバッチ管理ページ（管理者専用）

"use client";

import React from "react";
import { useCmHasRole } from "@/hooks/cm/useCmUser";
import { CmAlertBatchPanel } from "@/components/cm-components/admin/CmAlertBatchPanel";

export default function CmAlertBatchPage() {
  const isAdmin = useCmHasRole(["admin", "manager"]);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 font-medium">
            このページにアクセスする権限がありません
          </p>
          <p className="text-red-600 text-sm mt-2">
            管理者またはマネージャー権限が必要です
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            アラートバッチ管理
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            被保険者証・担当者未設定アラートのバッチ処理を管理します
          </p>
        </div>
      </div>

      {/* メインパネル */}
      <CmAlertBatchPanel />
    </div>
  );
}