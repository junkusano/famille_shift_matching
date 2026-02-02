// =============================================================
// src/components/cm-components/clients/CmClientDetailPageContent.tsx
// 利用者詳細のClient Component（タブ・インタラクション）
// =============================================================

'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CmClientDetailHeader } from '@/components/cm-components/clients/CmClientDetailHeader';
import { CmClientDetailTabs } from '@/components/cm-components/clients/CmClientDetailTabs';
import { CmClientBasicInfoTab } from '@/components/cm-components/clients/CmClientBasicInfoTab';
import { CmClientInsuranceTab } from '@/components/cm-components/clients/CmClientInsuranceTab';
import { CmClientDocumentsTab } from '@/components/cm-components/clients/CmClientDocumentsTab';
import { CmClientContractsTab } from '@/components/cm-components/clients/CmClientContractsTab';
import { CmClientDisabledTab } from '@/components/cm-components/clients/CmClientDisabledTab';
import { cmSortInsurances, cmIsInsuranceValid } from '@/lib/cm/utils';
import type { CmClientDetail, CmTabId } from '@/types/cm/clientDetail';

/** 有効なタブID */
const VALID_TABS: CmTabId[] = ['basic', 'insurance', 'documents', 'contracts', 'public', 'address', 'calculation', 'reduction', 'life'];

type Props = {
  client: CmClientDetail;
  initialTab: string;
};

export function CmClientDetailPageContent({ client, initialTab }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [activeTab, setActiveTab] = useState<CmTabId>(() => {
    if (VALID_TABS.includes(initialTab as CmTabId)) {
      return initialTab as CmTabId;
    }
    return 'basic';
  });

  // 被保険者証の展開状態（初期値: 有効な保険証または最初のもの）
  const [expandedInsurances, setExpandedInsurances] = useState<Set<string>>(() => {
    if (client.insurances?.length) {
      const sortedIns = cmSortInsurances(client.insurances);
      const validIns = sortedIns.find((ins) => cmIsInsuranceValid(ins));
      const targetIns = validIns || sortedIns[0];
      if (targetIns) {
        return new Set([targetIns.kaipoke_insurance_id]);
      }
    }
    return new Set();
  });

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleTabChange = useCallback((tabId: CmTabId) => {
    setActiveTab(tabId);

    // URLを更新（履歴に追加しない）
    const params = new URLSearchParams(searchParams.toString());
    if (tabId === 'basic') {
      params.delete('tab');
    } else {
      params.set('tab', tabId);
    }
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl);
  }, [router, pathname, searchParams]);

  const toggleInsurance = useCallback((insuranceId: string) => {
    setExpandedInsurances((prev) => {
      const next = new Set(prev);
      if (next.has(insuranceId)) {
        next.delete(insuranceId);
      } else {
        next.add(insuranceId);
      }
      return next;
    });
  }, []);

  // 更新（ページ再取得）
  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

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
      case 'contracts':
        return <CmClientContractsTab kaipokeCsId={client.kaipoke_cs_id} />;
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
        loading={isPending}
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