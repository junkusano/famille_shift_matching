// =============================================================
// src/app/cm-portal/clients/[id]/page.tsx
// 利用者詳細画面
// =============================================================

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CmCard } from '@/components/cm-components';
import {
  ArrowLeft,
  RefreshCw,
  User,
  FileText,
  Shield,
  Calculator,
  Wallet,
  Percent,
  MapPin,
  Heart,
  FolderOpen,
  Phone,
  Building,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { cmFormatAddress, cmCalculateAge, cmGetCareLevelStyle } from '@/lib/cm/utils';

// =============================================================
// 型定義
// =============================================================

type CmSupportOffice = {
  id: string;
  kaipoke_insurance_id: string;
  apply_start: string;
  office_name: string | null;
  contract_type: string | null;
  care_manager_id: string | null;
  care_manager_kaipoke_id: string | null;
  care_manager_name: string | null;
  support_center_name: string | null;
  notification_date: string | null;
};

type CmBenefitLimit = {
  id: string;
  kaipoke_insurance_id: string;
  limit_start: string;
  limit_end: string | null;
  benefit_rate: number;
};

type CmInsuranceInfo = {
  id: string;
  kaipoke_cs_id: string;
  kaipoke_insurance_id: string;
  coverage_start: string;
  coverage_end: string;
  insurer_code: string;
  insurer_name: string | null;
  cert_status: string | null;
  insured_number: string;
  issue_date: string | null;
  certification_date: string | null;
  cert_valid_start: string | null;
  cert_valid_end: string | null;
  care_level: string | null;
  limit_units: number | null;
  supportOffices: CmSupportOffice[];
  benefitLimits: CmBenefitLimit[];
};

type CmClientDetail = {
  id: string;
  kaipoke_cs_id: string;
  name: string;
  kana: string | null;
  gender: string | null;
  birth_date: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  town: string | null;
  building: string | null;
  phone_01: string | null;
  phone_02: string | null;
  client_status: string | null;
  contract_date: string | null;
  biko: string | null;
  is_active: boolean;
  documents: CmDocument[] | null;
  insurances: CmInsuranceInfo[];
};

type CmDocument = {
  id: string;
  url: string | null;
  label?: string;
  type?: string;
  mimeType?: string | null;
  uploaded_at?: string;
  acquired_at?: string;
};

type CmApiResponse = {
  ok: boolean;
  client?: CmClientDetail;
  error?: string;
};

// =============================================================
// 定数
// =============================================================

const CM_TABS = [
  { id: 'basic', label: '基本情報', icon: User },
  { id: 'insurance', label: '被保険者証情報', icon: Shield },
  { id: 'calculation', label: '算定情報', icon: Calculator, disabled: true },
  { id: 'public', label: '公費情報', icon: Wallet, disabled: true },
  { id: 'reduction', label: '減額認定情報', icon: Percent, disabled: true },
  { id: 'address', label: '住所地特例情報', icon: MapPin, disabled: true },
  { id: 'life', label: 'LIFE設定', icon: Heart, disabled: true },
  { id: 'documents', label: '書類管理', icon: FolderOpen },
] as const;

type CmTabId = typeof CM_TABS[number]['id'];

// =============================================================
// コンポーネント
// =============================================================

export default function CmClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kaipokeCsId = params.id as string;

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [client, setClient] = useState<CmClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CmTabId>('basic');

  // 被保険者証の展開状態
  const [expandedInsurances, setExpandedInsurances] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------
  // API 呼び出し
  // ---------------------------------------------------------
  const fetchClient = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/cm/clients/${kaipokeCsId}`, {
        credentials: 'include',
      });

      const data: CmApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setClient(null);
        return;
      }

      setClient(data.client || null);

      // 最新の被保険者証を展開
      if (data.client?.insurances?.[0]) {
        setExpandedInsurances(new Set([data.client.insurances[0].kaipoke_insurance_id]));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [kaipokeCsId]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleBack = () => {
    router.push('/cm-portal/clients');
  };

  const toggleInsurance = (insuranceId: string) => {
    setExpandedInsurances((prev) => {
      const next = new Set(prev);
      if (next.has(insuranceId)) {
        next.delete(insuranceId);
      } else {
        next.add(insuranceId);
      }
      return next;
    });
  };

  const openMap = (address: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  // ---------------------------------------------------------
  // レンダリング：ローディング・エラー
  // ---------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="space-y-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          一覧に戻る
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error || '利用者が見つかりません'}
        </div>
      </div>
    );
  }

  const age = cmCalculateAge(client.birth_date);
  const fullAddress = cmFormatAddress(client) + (client.building ? ` ${client.building}` : '');

  // ---------------------------------------------------------
  // タブコンテンツ
  // ---------------------------------------------------------
  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return <CmBasicInfoTab client={client} age={age} fullAddress={fullAddress} openMap={openMap} />;
      case 'insurance':
        return (
          <CmInsuranceTab
            insurances={client.insurances}
            expandedInsurances={expandedInsurances}
            toggleInsurance={toggleInsurance}
          />
        );
      case 'documents':
        return <CmDocumentsTab documents={client.documents} />;
      default:
        return <CmDisabledTab />;
    }
  };

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">{client.name}</h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  client.client_status === '利用中'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    client.client_status === '利用中' ? 'bg-green-500' : 'bg-slate-400'
                  }`}
                />
                {client.client_status ?? '不明'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {client.kana} {age && `・ ${age}歳`} {client.gender && `・ ${client.gender}`}
            </p>
          </div>
        </div>
        <button
          onClick={fetchClient}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          更新
        </button>
      </div>

      {/* タブナビゲーション */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-1 overflow-x-auto">
          {CM_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDisabled = 'disabled' in tab && tab.disabled;

            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && setActiveTab(tab.id)}
                disabled={isDisabled}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : isDisabled
                    ? 'border-transparent text-slate-300 cursor-not-allowed'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* タブコンテンツ */}
      {renderTabContent()}
    </div>
  );
}

// =============================================================
// 基本情報タブ
// =============================================================

function CmBasicInfoTab({
  client,
  age,
  fullAddress,
  openMap,
}: {
  client: CmClientDetail;
  age: number | null;
  fullAddress: string;
  openMap: (address: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 基本情報 */}
      <CmCard title="基本情報">
        <dl className="space-y-4">
          <CmDetailRow label="氏名" value={client.name} />
          <CmDetailRow label="氏名（カナ）" value={client.kana} />
          <CmDetailRow label="性別" value={client.gender} />
          <CmDetailRow label="生年月日" value={client.birth_date} subValue={age ? `${age}歳` : undefined} />
          <CmDetailRow label="カイポケID" value={client.kaipoke_cs_id} mono />
          <CmDetailRow label="利用者の状態" value={client.client_status} />
          <CmDetailRow label="契約日" value={client.contract_date} />
        </dl>
      </CmCard>

      {/* 住所・連絡先 */}
      <CmCard title="住所・連絡先">
        <dl className="space-y-4">
          <CmDetailRow label="郵便番号" value={client.postal_code ? `〒${client.postal_code}` : null} />
          <div>
            <dt className="text-xs font-medium text-slate-500 mb-1">住所</dt>
            <dd className="text-sm text-slate-800">
              {fullAddress || '-'}
              {fullAddress && (
                <button
                  onClick={() => openMap(fullAddress)}
                  className="ml-2 text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 text-xs"
                >
                  <ExternalLink className="w-3 h-3" />
                  地図
                </button>
              )}
            </dd>
          </div>
          <CmDetailRow
            label="電話番号1"
            value={client.phone_01}
            link={client.phone_01 ? `tel:${client.phone_01}` : undefined}
            icon={<Phone className="w-3 h-3" />}
          />
          <CmDetailRow
            label="電話番号2"
            value={client.phone_02}
            link={client.phone_02 ? `tel:${client.phone_02}` : undefined}
            icon={<Phone className="w-3 h-3" />}
          />
        </dl>
      </CmCard>

      {/* 備考 */}
      <CmCard title="備考" className="lg:col-span-2">
        <div className="text-sm text-slate-800 whitespace-pre-wrap">
          {client.biko || '（備考なし）'}
        </div>
      </CmCard>
    </div>
  );
}

// =============================================================
// 被保険者証情報タブ
// =============================================================

function CmInsuranceTab({
  insurances,
  expandedInsurances,
  toggleInsurance,
}: {
  insurances: CmInsuranceInfo[];
  expandedInsurances: Set<string>;
  toggleInsurance: (id: string) => void;
}) {
  if (insurances.length === 0) {
    return (
      <CmCard>
        <div className="text-center py-8 text-slate-500">
          被保険者証情報がありません
        </div>
      </CmCard>
    );
  }

  return (
    <div className="space-y-4">
      {insurances.map((insurance, index) => {
        const isExpanded = expandedInsurances.has(insurance.kaipoke_insurance_id);
        const isCurrent = index === 0;
        const careLevel = insurance.care_level;

        return (
          <CmCard key={insurance.id} noPadding>
            {/* ヘッダー（クリックで展開） */}
            <button
              onClick={() => toggleInsurance(insurance.kaipoke_insurance_id)}
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {insurance.coverage_start} 〜 {insurance.coverage_end}
                    </span>
                    {isCurrent && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                        現在有効
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{insurance.insurer_name ?? insurance.insurer_code}</span>
                    <span>被保険者番号: {insurance.insured_number}</span>
                    {careLevel && (
                      <span className={`px-2 py-0.5 rounded font-medium ${cmGetCareLevelStyle(careLevel)}`}>
                        {careLevel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {/* 展開コンテンツ */}
            {isExpanded && (
              <div className="border-t border-slate-200 px-4 py-4 space-y-6">
                {/* 認定情報 */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    認定情報
                  </h4>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-50 w-1/4">認定区分</th>
                        <td className="py-2 px-3 text-slate-800">{insurance.cert_status ?? '-'}</td>
                        <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-50 w-1/4">要介護度</th>
                        <td className="py-2 px-3 text-slate-800">
                          {insurance.care_level ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cmGetCareLevelStyle(insurance.care_level)}`}>
                              {insurance.care_level}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                      <tr>
                        <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-50">交付年月日</th>
                        <td className="py-2 px-3 text-slate-800">{insurance.issue_date ?? '-'}</td>
                        <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-50">認定年月日</th>
                        <td className="py-2 px-3 text-slate-800">{insurance.certification_date ?? '-'}</td>
                      </tr>
                      <tr>
                        <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-50">認定有効期間</th>
                        <td className="py-2 px-3 text-slate-800">
                          {insurance.cert_valid_start && insurance.cert_valid_end
                            ? `${insurance.cert_valid_start} 〜 ${insurance.cert_valid_end}`
                            : '-'}
                        </td>
                        <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-50">区分支給限度基準額単位数</th>
                        <td className="py-2 px-3 text-slate-800">{insurance.limit_units?.toLocaleString() ?? '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 居宅介護支援事業所 */}
                {insurance.supportOffices.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2 border-b border-slate-200 pb-2">
                      <Building className="w-4 h-4 text-green-600" />
                      居宅介護支援事業所
                    </h4>
                    {insurance.supportOffices.map((office) => (
                      <div
                        key={office.id}
                        className="bg-slate-50 rounded-lg mb-2 last:mb-0 overflow-hidden"
                      >
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-slate-200">
                            <tr>
                              <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-100 w-1/6">適用開始</th>
                              <td className="py-2 px-3 text-slate-800 w-1/3">{office.apply_start ?? '-'}</td>
                              <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-100 w-1/6">事業所名</th>
                              <td className="py-2 px-3 text-slate-800 font-medium">{office.office_name ?? '-'}</td>
                            </tr>
                            <tr>
                              <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-100">契約形態</th>
                              <td className="py-2 px-3 text-slate-800">{office.contract_type ?? '-'}</td>
                              <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-100">担当ケアマネ</th>
                              <td className="py-2 px-3 text-slate-800">{office.care_manager_name ?? '-'}</td>
                            </tr>
                            <tr>
                              <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-100">地域包括支援センター</th>
                              <td className="py-2 px-3 text-slate-800">{office.support_center_name ?? '-'}</td>
                              <th className="py-2 px-3 text-left font-medium text-slate-600 bg-slate-100">届出年月日</th>
                              <td className="py-2 px-3 text-slate-800">{office.notification_date ?? '-'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}

                {/* 給付制限 */}
                {insurance.benefitLimits.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-2 border-b border-amber-200 pb-2">
                      <AlertCircle className="w-4 h-4" />
                      給付制限
                    </h4>
                    {insurance.benefitLimits.map((limit) => (
                      <div
                        key={limit.id}
                        className="bg-amber-50 border border-amber-200 rounded-lg mb-2 last:mb-0 overflow-hidden"
                      >
                        <table className="w-full text-sm">
                          <tbody>
                            <tr>
                              <th className="py-2 px-3 text-left font-medium text-amber-700 bg-amber-100 w-1/6">適用開始</th>
                              <td className="py-2 px-3 text-slate-800">{limit.limit_start ?? '-'}</td>
                              <th className="py-2 px-3 text-left font-medium text-amber-700 bg-amber-100 w-1/6">適用終了</th>
                              <td className="py-2 px-3 text-slate-800">{limit.limit_end ?? '-'}</td>
                              <th className="py-2 px-3 text-left font-medium text-amber-700 bg-amber-100 w-1/6">給付率</th>
                              <td className="py-2 px-3 text-slate-800 font-semibold">{limit.benefit_rate}%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CmCard>
        );
      })}
    </div>
  );
}

// =============================================================
// 書類管理タブ
// =============================================================

function CmDocumentsTab({ documents }: { documents: CmDocument[] | null }) {
  const docs = documents ?? [];

  if (docs.length === 0) {
    return (
      <CmCard>
        <div className="text-center py-8">
          <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">書類がありません</p>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            書類を追加
          </button>
        </div>
      </CmCard>
    );
  }

  return (
    <CmCard title="書類一覧">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start gap-3">
              <FileText className="w-8 h-8 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {doc.label || '書類'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {doc.type || '種別未設定'}
                </p>
                {doc.acquired_at && (
                  <p className="text-xs text-slate-400 mt-1">
                    取得日: {doc.acquired_at}
                  </p>
                )}
              </div>
            </div>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-1 w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm text-slate-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                表示
              </a>
            )}
          </div>
        ))}
      </div>
    </CmCard>
  );
}

// =============================================================
// 未実装タブ
// =============================================================

function CmDisabledTab() {
  return (
    <CmCard>
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-slate-600 font-medium">この機能は準備中です</p>
        <p className="text-sm text-slate-500 mt-2">
          カイポケスクレイピング実装後に利用可能になります
        </p>
      </div>
    </CmCard>
  );
}

// =============================================================
// 共通コンポーネント
// =============================================================

function CmDetailRow({
  label,
  value,
  subValue,
  mono,
  link,
  icon,
}: {
  label: string;
  value?: string | number | null;
  subValue?: string;
  mono?: boolean;
  link?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 mb-1">{label}</dt>
      <dd className={`text-sm text-slate-800 ${mono ? 'font-mono' : ''}`}>
        {link && value ? (
          <a
            href={link}
            className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
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