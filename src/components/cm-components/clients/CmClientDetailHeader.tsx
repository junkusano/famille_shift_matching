// =============================================================
// src/components/cm-components/clients/CmClientDetailHeader.tsx
// 利用者詳細 - ヘッダー
// =============================================================

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { cmCalculateAge } from '@/lib/cm/utils';
import type { CmClientDetail } from '@/types/cm/clientDetail';
import styles from '@/styles/cm-styles/clients/detailHeader.module.css';

type Props = {
  client: CmClientDetail;
  loading: boolean;
  onRefresh: () => void;
};

export function CmClientDetailHeader({ client, loading, onRefresh }: Props) {
  const router = useRouter();
  const age = cmCalculateAge(client.birth_date);
  const isActive = client.client_status === '利用中';

  const handleBack = () => {
    router.push('/cm-portal/clients');
  };

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <button onClick={handleBack} className={styles.backButton}>
          <ArrowLeft className={styles.backIcon} />
        </button>
        <div>
          <div className={styles.nameRow}>
            <h1 className={styles.clientName}>{client.name}</h1>
            <span className={isActive ? styles.statusBadgeActive : styles.statusBadgeInactive}>
              <span className={isActive ? styles.statusDotActive : styles.statusDotInactive} />
              {client.client_status ?? '不明'}
            </span>
          </div>
          <p className={styles.subInfo}>
            {client.kana} {age && `・ ${age}歳`} {client.gender && `・ ${client.gender}`}
          </p>
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className={styles.refreshButton}
      >
        <RefreshCw className={loading ? styles.refreshIconSpin : styles.refreshIcon} />
        更新
      </button>
    </div>
  );
}
