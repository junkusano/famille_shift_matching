// =============================================================
// src/components/cm-components/clients/CmInsuranceCertSection.tsx
// 利用者詳細 被保険者証タブ - 認定情報セクション
// =============================================================

'use client';

import React from 'react';
import { Shield } from 'lucide-react';
import type { CmInsuranceDetail } from '@/types/cm/clientDetail';

export function CmInsuranceCertSection({
  insurance,
}: {
  insurance: CmInsuranceDetail;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-blue-600 px-4 py-2 flex items-center gap-2">
        <Shield className="w-4 h-4 text-white" />
        <h4 className="text-sm font-semibold text-white">認定情報</h4>
      </div>
      {/* 内容 */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">証の状態</div>
            <div className="text-sm text-slate-800">{insurance.cert_status ?? '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">交付年月日</div>
            <div className="text-sm text-slate-800">{insurance.issue_date ?? '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">認定年月日</div>
            <div className="text-sm text-slate-800">{insurance.certification_date ?? '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">認定有効期間</div>
            <div className="text-sm text-slate-800">
              {insurance.cert_valid_start && insurance.cert_valid_end
                ? `${insurance.cert_valid_start} 〜 ${insurance.cert_valid_end}`
                : '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">区分支給限度基準額単位数</div>
            <div className="text-sm text-slate-800">{insurance.limit_units?.toLocaleString() ?? '-'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">保険者コード</div>
            <div className="text-sm font-mono text-slate-800">{insurance.insurer_code}</div>
          </div>
        </div>
      </div>
    </div>
  );
}