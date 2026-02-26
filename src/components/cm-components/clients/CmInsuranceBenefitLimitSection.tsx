// =============================================================
// src/components/cm-components/clients/CmInsuranceBenefitLimitSection.tsx
// 利用者詳細 被保険者証タブ - 給付制限セクション
// =============================================================

'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CmInsuranceDetail } from '@/types/cm/clientDetail';

export function CmInsuranceBenefitLimitSection({
  benefitLimits,
}: {
  benefitLimits: CmInsuranceDetail['benefitLimits'];
}) {
  return (
    <div className="bg-white rounded-lg border border-amber-400 shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-amber-500 px-4 py-2 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-white" />
        <h4 className="text-sm font-semibold text-white">給付制限（{benefitLimits.length}件）</h4>
      </div>
      {/* 内容 */}
      <div className="p-4 space-y-3">
        {benefitLimits.map((limit) => (
          <div
            key={limit.id}
            className="grid grid-cols-3 gap-4 p-3 bg-amber-50 border border-amber-300 rounded"
          >
            <div>
              <div className="text-xs text-amber-700 mb-1">適用開始</div>
              <div className="text-sm text-slate-800">{limit.limit_start ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-amber-700 mb-1">適用終了</div>
              <div className="text-sm text-slate-800">{limit.limit_end ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-amber-700 mb-1">給付率</div>
              <div className="text-sm text-slate-800 font-semibold">{limit.benefit_rate}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}