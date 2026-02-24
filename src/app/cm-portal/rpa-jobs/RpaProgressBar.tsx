// =============================================================
// src/app/cm-portal/rpa-jobs/RpaProgressBar.tsx
// RPAジョブ - 進捗バー
// =============================================================

'use client';

import React from 'react';

export function RpaProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, progress)}%` }}
      />
    </div>
  );
}
