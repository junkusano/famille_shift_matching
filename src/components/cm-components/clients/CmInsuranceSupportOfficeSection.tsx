// =============================================================
// src/components/cm-components/clients/CmInsuranceSupportOfficeSection.tsx
// 利用者詳細 被保険者証タブ - 居宅介護支援事業所セクション
// =============================================================

'use client';

import React from 'react';
import { Building } from 'lucide-react';
import type { CmInsuranceDetail } from '@/types/cm/clientDetail';

export function CmInsuranceSupportOfficeSection({
  supportOffices,
}: {
  supportOffices: CmInsuranceDetail['supportOffices'];
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-green-600 px-4 py-2 flex items-center gap-2">
        <Building className="w-4 h-4 text-white" />
        <h4 className="text-sm font-semibold text-white">居宅介護支援事業所（{supportOffices.length}件）</h4>
      </div>
      {/* 内容 */}
      <div className="p-4 space-y-3">
        {supportOffices.map((office, index) => (
          <div
            key={office.id}
            className={`grid grid-cols-2 md:grid-cols-5 gap-4 p-3 rounded border ${index === 0 ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200'}`}
          >
            <div>
              <div className="text-xs text-slate-500 mb-1">適用開始</div>
              <div className="text-sm text-slate-800">{office.apply_start ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">事業所名</div>
              <div className="text-sm text-slate-800 font-medium">{office.office_name ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">契約形態</div>
              <div className="text-sm text-slate-800">{office.contract_type ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">担当ケアマネ</div>
              <div className="text-sm text-slate-800">{office.care_manager_name ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">届出年月日</div>
              <div className="text-sm text-slate-800">{office.notification_date ?? '-'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}