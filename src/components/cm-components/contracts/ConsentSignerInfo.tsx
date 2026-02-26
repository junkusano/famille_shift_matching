// =============================================================
// src/components/cm-components/contracts/ConsentSignerInfo.tsx
// 契約詳細 - 同意情報の署名者表示（signer_type別）
// =============================================================

'use client';

import React from 'react';
import type { CmContractDetailData } from '@/types/cm/contract';

/** 同意情報の署名者表示（signer_type別） */
export function ConsentSignerInfo({ consent }: { consent: NonNullable<CmContractDetailData['consent']> }) {
  if (consent.signer_type === 'scribe') {
    return (
      <div className="space-y-0.5">
        <p className="text-slate-700">
          署名者: <span className="font-medium">代筆</span>
        </p>
        {consent.scribe_name && (
          <p className="text-slate-600">
            代筆者: {consent.scribe_name}
            {consent.scribe_relationship_code && ` (${consent.scribe_relationship_code})`}
          </p>
        )}
        {consent.scribe_reason_code && (
          <p className="text-slate-600">理由: {consent.scribe_reason_code}</p>
        )}
      </div>
    );
  }

  if (consent.signer_type === 'agent') {
    return (
      <div className="space-y-0.5">
        <p className="text-slate-700">
          署名者: <span className="font-medium">代理人</span>
        </p>
        {consent.agent_name && (
          <p className="text-slate-600">
            代理人: {consent.agent_name}
            {consent.agent_relationship_code && ` (${consent.agent_relationship_code})`}
          </p>
        )}
        {consent.agent_authority && (
          <p className="text-slate-600">根拠: {consent.agent_authority}</p>
        )}
        {consent.guardian_type && (
          <p className="text-slate-600">
            後見類型: {consent.guardian_type}
            {consent.guardian_confirmed && ' ✓確認済'}
          </p>
        )}
      </div>
    );
  }

  // self
  return (
    <p className="text-slate-700">
      署名者: <span className="font-medium">本人</span>
    </p>
  );
}
