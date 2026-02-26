// =============================================================
// src/components/cm-components/contracts/SignerRow.tsx
// 契約詳細 - 署名者行コンポーネント
// =============================================================

'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { cmFormatDateTime } from '@/lib/cm/utils';
import { SigningStatusBadge } from './SigningStatusBadge';
import type { CmContractDocumentSigner } from '@/types/cm/contract';

/** 署名者ロールの表示ラベル */
const SIGNER_ROLE_LABELS: Record<string, string> = {
  signer: '利用者',
  family: '家族',
  scribe: '代筆者',
  agent: '代理人',
};

export function SignerRow({ signer }: { signer: CmContractDocumentSigner }) {
  const roleLabel = SIGNER_ROLE_LABELS[signer.role] ?? signer.role;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 min-w-[4rem]">{roleLabel}</span>
      <SigningStatusBadge status={signer.signing_status} />
      {signer.signing_url && signer.signing_status !== 'signed' && (
        <a
          href={signer.signing_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-800 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          署名URL
        </a>
      )}
      {signer.signed_at && (
        <span className="text-slate-400">{cmFormatDateTime(signer.signed_at)}</span>
      )}
    </div>
  );
}
