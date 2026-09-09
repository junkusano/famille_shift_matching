// =============================================================
// src/components/cm-components/contracts/InfoRow.tsx
// 契約詳細 - 情報行コンポーネント
// =============================================================

'use client';

import React from 'react';

export function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium mt-0.5">{value || '\u2014'}</dd>
    </div>
  );
}
