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
import styles from '@/styles/cm-styles/clients/insuranceTab.module.css';

type Props = {
  insurances: CmInsuranceDetail[];
  expandedInsurances: Set<string>;
  toggleInsurance: (id: string) => void;
};

// =============================================================
// ステータス判定
// =============================================================

type InsuranceStatus = 'valid' | 'future' | 'expired';

function getInsuranceStatus(insurance: {
  coverage_start: string;
  coverage_end: string;
}): InsuranceStatus {
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

/** ステータスに応じたCSSクラスマップ */
const CARD_STYLE_MAP: Record<InsuranceStatus, string> = {
  valid: styles.insuranceCardValid,
  future: styles.insuranceCardFuture,
  expired: styles.insuranceCardExpired,
};

const BADGE_STYLE_MAP: Record<InsuranceStatus, string> = {
  valid: styles.statusBadgeValid,
  future: styles.statusBadgeFuture,
  expired: styles.statusBadgeExpired,
};

const STATUS_LABEL_MAP: Record<InsuranceStatus, string> = {
  valid: '現在有効',
  future: '将来適用',
  expired: '期限切れ',
};

// =============================================================
// メインコンポーネント
// =============================================================

export function CmClientInsuranceTab({
  insurances,
  expandedInsurances,
  toggleInsurance,
}: Props) {
  if (insurances.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <div className={styles.emptyText}>
          被保険者証情報がありません
        </div>
      </div>
    );
  }

  const sortedInsurances = cmSortInsurances(insurances);

  return (
    <div className={styles.container}>
      {/* 件数表示 */}
      <div className={styles.countText}>
        被保険者証情報（<span className={styles.countNumber}>{insurances.length}</span>件）
      </div>

      {/* カード一覧 */}
      {sortedInsurances.map((insurance) => {
        const isExpanded = expandedInsurances.has(insurance.kaipoke_insurance_id);
        const status = getInsuranceStatus(insurance);
        const careLevel = insurance.care_level;
        const latestOffice = insurance.supportOffices?.[0];

        return (
          <div key={insurance.id} className={CARD_STYLE_MAP[status]}>
            {/* ヘッダー行 */}
            <div className={styles.cardHeader}>
              <div>状態</div>
              <div>適用期間</div>
              <div>介護度</div>
              <div>保険者</div>
              <div>被保険者番号</div>
              <div>担当ケアマネ</div>
            </div>

            {/* データ行 */}
            <div className={styles.cardData}>
              {/* 状態 */}
              <div>
                <span className={BADGE_STYLE_MAP[status]}>
                  {STATUS_LABEL_MAP[status]}
                </span>
              </div>

              {/* 適用期間 */}
              <div className={styles.cellText}>
                <div>{insurance.coverage_start}</div>
                <div className={styles.cellTextSub}>〜{insurance.coverage_end}</div>
              </div>

              {/* 介護度 */}
              <div>
                {careLevel ? (
                  <span className={styles.careLevelBadge} style={careLevelInlineStyle(careLevel)}>
                    {careLevel}
                  </span>
                ) : (
                  <span className={styles.cellEmpty}>-</span>
                )}
              </div>

              {/* 保険者 */}
              <div className={styles.cellText}>
                {insurance.insurer_name ?? '-'}
              </div>

              {/* 被保険者番号 */}
              <div className={styles.cellMono}>
                {insurance.insured_number}
              </div>

              {/* 担当ケアマネ */}
              <div className={styles.cellText}>
                {latestOffice?.care_manager_name ?? '-'}
              </div>
            </div>

            {/* 詳細ボタン */}
            <button
              onClick={() => toggleInsurance(insurance.kaipoke_insurance_id)}
              className={styles.toggleButton}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className={styles.toggleIcon} />
                  詳細を閉じる
                </>
              ) : (
                <>
                  <ChevronDown className={styles.toggleIcon} />
                  詳細を表示
                </>
              )}
            </button>

            {/* 展開コンテンツ */}
            {isExpanded && (
              <div className={styles.expandedContent}>
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
// ヘルパー: cmGetCareLevelStyleはTailwindクラスを返すため、
// CSS Module環境ではインラインスタイルに変換する
// =============================================================

function careLevelInlineStyle(careLevel: string): React.CSSProperties {
  const tailwindClass = cmGetCareLevelStyle(careLevel);
  // cmGetCareLevelStyleが返すTailwindクラスからカラーを推定
  if (tailwindClass.includes('bg-red')) return { backgroundColor: '#fef2f2', color: '#b91c1c' };
  if (tailwindClass.includes('bg-orange')) return { backgroundColor: '#fff7ed', color: '#c2410c' };
  if (tailwindClass.includes('bg-amber')) return { backgroundColor: '#fffbeb', color: '#b45309' };
  if (tailwindClass.includes('bg-yellow')) return { backgroundColor: '#fefce8', color: '#a16207' };
  if (tailwindClass.includes('bg-green')) return { backgroundColor: '#f0fdf4', color: '#15803d' };
  if (tailwindClass.includes('bg-blue')) return { backgroundColor: '#eff6ff', color: '#1d4ed8' };
  return { backgroundColor: '#f1f5f9', color: '#475569' };
}

// =============================================================
// サブコンポーネント：認定詳細
// =============================================================

function CmInsuranceCertSection({ insurance }: { insurance: CmInsuranceDetail }) {
  return (
    <div className={styles.subSectionBorderSlate}>
      {/* ヘッダー */}
      <div className={styles.subSectionHeaderBlue}>
        <Shield className={styles.subSectionIcon} />
        <h4 className={styles.subSectionTitle}>認定詳細</h4>
      </div>
      {/* 内容 */}
      <div className={styles.subSectionBody}>
        <div className={styles.certGrid}>
          <div>
            <div className={styles.certLabel}>認定区分</div>
            <div className={styles.certValue}>{insurance.cert_status ?? '-'}</div>
          </div>
          <div>
            <div className={styles.certLabel}>交付年月日</div>
            <div className={styles.certValue}>{insurance.issue_date ?? '-'}</div>
          </div>
          <div>
            <div className={styles.certLabel}>認定年月日</div>
            <div className={styles.certValue}>{insurance.certification_date ?? '-'}</div>
          </div>
          <div>
            <div className={styles.certLabel}>認定有効期間</div>
            <div className={styles.certValue}>
              {insurance.cert_valid_start && insurance.cert_valid_end
                ? `${insurance.cert_valid_start} 〜 ${insurance.cert_valid_end}`
                : '-'}
            </div>
          </div>
          <div>
            <div className={styles.certLabel}>区分支給限度基準額単位数</div>
            <div className={styles.certValue}>{insurance.limit_units?.toLocaleString() ?? '-'}</div>
          </div>
          <div>
            <div className={styles.certLabel}>保険者コード</div>
            <div className={styles.certValueMono}>{insurance.insurer_code}</div>
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
    <div className={styles.subSectionBorderSlate}>
      {/* ヘッダー */}
      <div className={styles.subSectionHeaderGreen}>
        <Building className={styles.subSectionIcon} />
        <h4 className={styles.subSectionTitle}>居宅介護支援事業所（{supportOffices.length}件）</h4>
      </div>
      {/* 内容 */}
      <div className={styles.subSectionList}>
        {supportOffices.map((office, index) => (
          <div
            key={office.id}
            className={index === 0 ? styles.officeRowPrimary : styles.officeRowDefault}
          >
            <div>
              <div className={styles.certLabel}>適用開始</div>
              <div className={styles.certValue}>{office.apply_start ?? '-'}</div>
            </div>
            <div>
              <div className={styles.certLabel}>事業所名</div>
              <div className={styles.certValue} style={{ fontWeight: 500 }}>{office.office_name ?? '-'}</div>
            </div>
            <div>
              <div className={styles.certLabel}>契約形態</div>
              <div className={styles.certValue}>{office.contract_type ?? '-'}</div>
            </div>
            <div>
              <div className={styles.certLabel}>担当ケアマネ</div>
              <div className={styles.certValue}>{office.care_manager_name ?? '-'}</div>
            </div>
            <div>
              <div className={styles.certLabel}>届出年月日</div>
              <div className={styles.certValue}>{office.notification_date ?? '-'}</div>
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
    <div className={styles.subSectionBorderAmber}>
      {/* ヘッダー */}
      <div className={styles.subSectionHeaderAmber}>
        <AlertTriangle className={styles.subSectionIcon} />
        <h4 className={styles.subSectionTitle}>給付制限（{benefitLimits.length}件）</h4>
      </div>
      {/* 内容 */}
      <div className={styles.subSectionList}>
        {benefitLimits.map((limit) => (
          <div key={limit.id} className={styles.benefitRow}>
            <div>
              <div className={styles.benefitLabel}>適用開始</div>
              <div className={styles.benefitValue}>{limit.limit_start ?? '-'}</div>
            </div>
            <div>
              <div className={styles.benefitLabel}>適用終了</div>
              <div className={styles.benefitValue}>{limit.limit_end ?? '-'}</div>
            </div>
            <div>
              <div className={styles.benefitLabel}>給付率</div>
              <div className={styles.benefitValueBold}>{limit.benefit_rate}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
