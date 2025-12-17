// =============================================================
// src/hooks/cm/useCmClientDetail.ts
// 利用者詳細のデータ取得・状態管理フック
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
import type {
  CmClientDetail,
  CmClientDetailApiResponse,
  CmTabId,
} from '@/types/cm/clientDetail';
import { cmSortInsurances, cmIsInsuranceValid } from '@/lib/cm/utils';

export function useCmClientDetail(kaipokeCsId: string) {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [client, setClient] = useState<CmClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CmTabId>('basic');
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
  // ハンドラー
  // ---------------------------------------------------------
  const handleTabChange = useCallback((tabId: CmTabId) => {
    setActiveTab(tabId);
  }, []);

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