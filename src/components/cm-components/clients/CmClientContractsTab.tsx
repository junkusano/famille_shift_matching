// =============================================================
// src/components/cm-components/clients/CmClientContractsTab.tsx
// 利用者詳細 - 契約タブ
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import { getAccessToken } from '@/lib/cm/auth/getAccessToken';
import { getContracts } from '@/lib/cm/contracts/getContracts';
import type {
  CmContractListItem,
  CmContractConsent,
} from '@/types/cm/contract';
import styles from '@/styles/cm-styles/clients/contractsTab.module.css';
import { ConsentStatusCard } from './ConsentStatusCard';
import { ContractListCard } from './ContractListCard';

// =============================================================
// Types
// =============================================================

type Props = {
  kaipokeCsId: string;
};

// =============================================================
// Component
// =============================================================

export function CmClientContractsTab({ kaipokeCsId }: Props) {
  const [consent, setConsent] = useState<CmContractConsent | null>(null);
  const [contracts, setContracts] = useState<CmContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAccessToken();
      const result = await getContracts(kaipokeCsId, token);

      if (result.ok === false) {
        setError(result.error || '契約情報の取得に失敗しました');
      } else {
        setConsent(result.data.consent);
        setContracts(result.data.contracts);
      }
    } catch {
      setError('契約情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [kaipokeCsId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------
  // ローディング
  // ---------------------------------------------------------
  if (loading) {
    return (
      <CmCard>
        <div className={styles.loadingContainer}>
          <Loader2 className={styles.loadingSpinner} />
          <span className={styles.loadingText}>読み込み中...</span>
        </div>
      </CmCard>
    );
  }

  // ---------------------------------------------------------
  // エラー
  // ---------------------------------------------------------
  if (error) {
    return (
      <CmCard>
        <div className={styles.errorContainer}>
          <AlertCircle className={styles.errorIcon} />
          <span>{error}</span>
        </div>
      </CmCard>
    );
  }

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className={styles.container}>
      <ConsentStatusCard consent={consent} kaipokeCsId={kaipokeCsId} />
      <ContractListCard
        contracts={contracts}
        kaipokeCsId={kaipokeCsId}
        hasConsent={!!consent}
        onContractsChange={setContracts}
      />
    </div>
  );
}