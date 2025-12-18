// =============================================================
// src/hooks/cm/useCmClientDetail.ts
// 利用者詳細のデータ取得・状態管理フック
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type {
  CmClientDetail,
  CmClientDetailApiResponse,
  CmTabId,
} from '@/types/cm/clientDetail';
import { cmSortInsurances, cmIsInsuranceValid } from '@/lib/cm/utils';

/** 有効なタブID */
const VALID_TABS: CmTabId[] = ['basic', 'insurance', 'documents', 'public', 'address', 'calculation', 'reduction', 'life'];

export function useCmClientDetail(kaipokeCsId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ---------------------------------------------------------
  // URLからタブを取得
  // ---------------------------------------------------------
  const getInitialTab = (): CmTabId => {
    const tabParam = searchParams.get('tab');
    if (tabParam && VALID_TABS.includes(tabParam as CmTabId)) {
      return tabParam as CmTabId;
    }
    return 'basic';
  };

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [client, setClient] = useState<CmClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CmTabId>(getInitialTab);
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

      const data: CmClientDetailApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setClient(null);
        return;
      }

      setClient(data.client || null);

      // 現在有効な被保険者証を展開（なければ最初のものを展開）
      if (data.client?.insurances?.length) {
        const sortedIns = cmSortInsurances(data.client.insurances);
        const validIns = sortedIns.find((ins) => cmIsInsuranceValid(ins));
        const targetIns = validIns || sortedIns[0];
        if (targetIns) {
          setExpandedInsurances(new Set([targetIns.kaipoke_insurance_id]));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [kaipokeCsId]);

  // ---------------------------------------------------------
  // 初回読み込み
  // ---------------------------------------------------------
  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  // ---------------------------------------------------------
  // URLパラメータ変更時にタブを同期
  // ---------------------------------------------------------
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && VALID_TABS.includes(tabParam as CmTabId)) {
      setActiveTab(tabParam as CmTabId);
    }
  }, [searchParams]);

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

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    client,
    loading,
    error,

    // タブ
    activeTab,
    handleTabChange,

    // 被保険者証展開
    expandedInsurances,
    toggleInsurance,

    // アクション
    refresh: fetchClient,
  };
}