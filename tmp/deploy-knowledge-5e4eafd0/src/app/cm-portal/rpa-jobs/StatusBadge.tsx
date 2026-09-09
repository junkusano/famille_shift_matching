// =============================================================
// src/app/cm-portal/rpa-jobs/StatusBadge.tsx
// RPAジョブ - ステータスバッジ
// =============================================================

'use client';

import React from 'react';

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
    skipped: 'bg-gray-100 text-gray-600',
  };

  const labels: Record<string, string> = {
    pending: '待機中',
    processing: '処理中',
    completed: '完了',
    failed: '失敗',
    cancelled: 'キャンセル',
    skipped: 'スキップ',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        styles[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {labels[status] || status}
    </span>
  );
}
