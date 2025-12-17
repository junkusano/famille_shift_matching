// =============================================================
// src/components/cm-components/clients/CmClientInsuranceTab.tsx
// 利用者詳細 - 被保険者証情報タブ（テーブルヘッダー形式）
// =============================================================

'use client';

import React from 'react';
import {
  Shield,
  Building,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  cmGetCareLevelStyle,
  cmSortInsurances,
  cmParseJapaneseDate,
} from '@/lib/cm/utils';
import type { CmInsuranceDetail } from '@/types/cm/clientDetail';

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
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cmGetCareLevelStyle(careLevel)}`}>
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

            {/* 展開コンテンツ */}
            {isExpanded && (
              <div className="border-t-2 border-slate-300 bg-slate-100 p-4 space-y-4">
                {/* 認定詳細 */}
                <CmInsuranceCertSection insurance={insurance} />

                {/* 居宅介護支援事業所 */}
                {insurance.supportOffices.length > 0 && (
                  <CmInsuranceSupportOfficeSection
                    supportOffices={insurance.supportOffices}
                  />
                )}

                {/* 給付制限 */}
                {insurance.benefitLimits.length > 0 && (
                  <CmInsuranceBenefitLimitSection
                    benefitLimits={insurance.benefitLimits}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================
// サブコンポーネント：認定詳細
// =============================================================

function CmInsuranceCertSection({ insurance }: { insurance: CmInsuranceDetail }) {
  return (
    <div className="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-blue-600 px-4 py-2 flex items-center gap-2">
        <Shield className="w-4 h-4 text-white" />
        <h4 className="text-sm font-semibold text-white">認定詳細</h4>
      </div>
      {/* 内容 */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">認定区分</div>
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

// =============================================================
// サブコンポーネント：居宅介護支援事業所
// =============================================================

function CmInsuranceSupportOfficeSection({
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

// =============================================================
// サブコンポーネント：給付制限
// =============================================================

function CmInsuranceBenefitLimitSection({
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