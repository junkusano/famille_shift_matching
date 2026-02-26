// =============================================================
// src/components/cm-components/clients/CmClientInsuranceTab.tsx
// 利用者詳細 - 被保険者証情報タブ（テーブルヘッダー形式）
// =============================================================

'use client';

import React from 'react';
import {
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  cmGetCareLevelVariant,
  cmSortInsurances,
  cmParseJapaneseDate,
} from '@/lib/cm/utils';
import { CM_CARE_LEVEL_STYLES } from '@/constants/cm/careLevelStyle';
import type { CmInsuranceDetail } from '@/types/cm/clientDetail';
import { CmInsuranceCertSection } from './CmInsuranceCertSection';
import { CmInsuranceSupportOfficeSection } from './CmInsuranceSupportOfficeSection';
import { CmInsuranceBenefitLimitSection } from './CmInsuranceBenefitLimitSection';

type Props = {
  insurances: CmInsuranceDetail[];
  expandedInsurances: Set<string>;
  toggleInsurance: (id: string) => void;
};

/**
 * 被保険者証の状態を判定
 */
function getInsuranceStatus(insurance: {
  coverage_start: string;
  coverage_end: string;
}): 'valid' | 'future' | 'expired' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = cmParseJapaneseDate(insurance.coverage_start);
  const end = cmParseJapaneseDate(insurance.coverage_end);

  if (!start || !end) return 'expired';

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (today < start) return 'future';
  if (today >= start && today <= end) return 'valid';
  return 'expired';
}

/**
 * 状態に応じたスタイルを取得
 */
function getStatusStyles(status: 'valid' | 'future' | 'expired'): {
  borderColor: string;
  labelBg: string;
  label: string | null;
} {
  switch (status) {
    case 'valid':
      return {
        borderColor: 'border-l-green-500',
        labelBg: 'bg-green-500',
        label: '現在有効',
      };
    case 'future':
      return {
        borderColor: 'border-l-blue-500',
        labelBg: 'bg-blue-500',
        label: '将来適用',
      };
    case 'expired':
      return {
        borderColor: 'border-l-slate-300',
        labelBg: 'bg-slate-400',
        label: '期限切れ',
      };
  }
}

export function CmClientInsuranceTab({
  insurances,
  expandedInsurances,
  toggleInsurance,
}: Props) {
  if (insurances.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
        <div className="text-center text-slate-500">
          被保険者証情報がありません
        </div>
      </div>
    );
  }

  // 有効期間順にソート
  const sortedInsurances = cmSortInsurances(insurances);

  return (
    <div className="space-y-4">
      {/* 件数表示 */}
      <div className="text-sm text-slate-600">
        被保険者証情報（<span className="font-semibold text-slate-800">{insurances.length}</span>件）
      </div>

      {/* カード一覧 */}
      {sortedInsurances.map((insurance) => {
        const isExpanded = expandedInsurances.has(insurance.kaipoke_insurance_id);
        const status = getInsuranceStatus(insurance);
        const styles = getStatusStyles(status);
        const careLevel = insurance.care_level;
        const latestOffice = insurance.supportOffices?.[0];

        return (
          <div
            key={insurance.id}
            className={`bg-white rounded-lg shadow-sm border border-slate-200 border-l-4 ${styles.borderColor} overflow-hidden`}
          >
            {/* ヘッダー行 */}
            <div className="grid grid-cols-6 gap-2 px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs font-medium text-slate-600">
              <div>状態</div>
              <div>適用期間</div>
              <div>介護度</div>
              <div>保険者</div>
              <div>被保険者番号</div>
              <div>担当ケアマネ</div>
            </div>

            {/* データ行 */}
            <div className="grid grid-cols-6 gap-2 px-4 py-3 items-center">
              {/* 状態 */}
              <div>
                <span className={`inline-block px-2 py-1 text-xs font-medium rounded text-white ${styles.labelBg}`}>
                  {styles.label}
                </span>
              </div>

              {/* 適用期間 */}
              <div className="text-sm text-slate-800">
                <div>{insurance.coverage_start}</div>
                <div className="text-slate-500">〜{insurance.coverage_end}</div>
              </div>

              {/* 介護度 */}
              <div>
                {careLevel ? (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                    style={CM_CARE_LEVEL_STYLES[cmGetCareLevelVariant(careLevel)]}
                  >
                    {careLevel}
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">-</span>
                )}
              </div>

              {/* 保険者 */}
              <div className="text-sm text-slate-800">
                {insurance.insurer_name ?? '-'}
              </div>

              {/* 被保険者番号 */}
              <div className="text-sm font-mono text-slate-800">
                {insurance.insured_number}
              </div>

              {/* 担当ケアマネ */}
              <div className="text-sm text-slate-800">
                {latestOffice?.care_manager_name ?? '-'}
              </div>
            </div>

            {/* 詳細ボタン */}
            <button
              onClick={() => toggleInsurance(insurance.kaipoke_insurance_id)}
              className="w-full px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-center gap-2 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  詳細を閉じる
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  詳細を表示
                </>
              )}
            </button>

            {/* 展開時の詳細情報 */}
            {isExpanded && (
              <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50">
                {/* 認定情報 */}
                <CmInsuranceCertSection insurance={insurance} />

                {/* 居宅介護支援事業所 */}
                {insurance.supportOffices && insurance.supportOffices.length > 0 && (
                  <CmInsuranceSupportOfficeSection supportOffices={insurance.supportOffices} />
                )}

                {/* 給付制限 */}
                {insurance.benefitLimits && insurance.benefitLimits.length > 0 && (
                  <CmInsuranceBenefitLimitSection benefitLimits={insurance.benefitLimits} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}