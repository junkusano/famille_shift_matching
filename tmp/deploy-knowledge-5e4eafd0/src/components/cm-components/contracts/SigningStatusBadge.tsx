// =============================================================
// src/components/cm-components/contracts/SigningStatusBadge.tsx
// 契約詳細 - 署名ステータスバッジ
// =============================================================

'use client';

import React from 'react';
import type { CmDocumentSigningStatus } from '@/types/cm/contract';

export function SigningStatusBadge({ status }: { status: CmDocumentSigningStatus }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending:  { bg: 'bg-slate-100',  text: 'text-slate-600',  label: '未送信' },
    signing:  { bg: 'bg-amber-100',  text: 'text-amber-700',  label: '署名中' },
    signed:   { bg: 'bg-green-100',  text: 'text-green-700',  label: '署名済' },
    declined: { bg: 'bg-red-100',    text: 'text-red-700',    label: '辞退' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
