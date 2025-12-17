// =============================================================
// src/components/cm-components/clients/CmClientDetailRow.tsx
// 詳細表示の共通行コンポーネント
// =============================================================

'use client';

import React from 'react';

type Props = {
  label: string;
  value?: string | number | null;
  subValue?: string;
  mono?: boolean;
  link?: string;
  icon?: React.ReactNode;
};

export function CmClientDetailRow({
  label,
  value,
  subValue,
  mono,
  link,
  icon,
}: Props) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 mb-1">{label}</dt>
      <dd className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>
        {link && value ? (
          <a href={link} className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
            {icon}
            {value}
          </a>
        ) : (
          value ?? '-'
        )}
        {subValue && <span className="text-slate-500 ml-2">({subValue})</span>}
      </dd>
    </div>
  );
}