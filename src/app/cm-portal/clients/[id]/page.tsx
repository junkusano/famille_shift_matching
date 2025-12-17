// =============================================================
// src/app/cm-portal/clients/[id]/page.tsx
// 利用者詳細画面
// =============================================================

'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { useCmClientDetail } from '@/hooks/cm/useCmClientDetail';
import { CmClientDetailHeader } from '@/components/cm-components/clients/CmClientDetailHeader';
import { CmClientDetailTabs } from '@/components/cm-components/clients/CmClientDetailTabs';
import { CmClientBasicInfoTab } from '@/components/cm-components/clients/CmClientBasicInfoTab';
import { CmClientInsuranceTab } from '@/components/cm-components/clients/CmClientInsuranceTab';
import { CmClientDocumentsTab } from '@/components/cm-components/clients/CmClientDocumentsTab';
import { CmClientDisabledTab } from '@/components/cm-components/clients/CmClientDisabledTab';

export default function CmClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kaipokeCsId = params.id as string;

  const {
    client,
    loading,
    error,
    activeTab,
    handleTabChange,
    expandedInsurances,
    toggleInsurance,
    refresh,
  } = useCmClientDetail(kaipokeCsId);

  // ---------------------------------------------------------
  // ローディング
  // ---------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ---------------------------------------------------------
  // エラー
  // ---------------------------------------------------------
  if (error || !client) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push('/cm-portal/clients')}
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

  // ---------------------------------------------------------
  // タブコンテンツ
  // ---------------------------------------------------------
  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return <CmClientBasicInfoTab client={client} />;
      case 'insurance':
        return (
          <CmClientInsuranceTab
            insurances={client.insurances}
            expandedInsurances={expandedInsurances}
            toggleInsurance={toggleInsurance}
          />
        );
      case 'documents':
        return <CmClientDocumentsTab documents={client.documents} />;
      default:
        return <CmClientDisabledTab />;
    }
  };

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <CmClientDetailHeader
        client={client}
        loading={loading}
        onRefresh={refresh}
      />

      {/* タブナビゲーション */}
      <CmClientDetailTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* タブコンテンツ */}
      {renderTabContent()}
    </div>
  );
}