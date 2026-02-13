// =============================================================
// src/components/cm-components/clients/CmClientDisabledTab.tsx
// 利用者詳細 - 未実装タブ
// =============================================================

'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import styles from '@/styles/cm-styles/clients/disabledTab.module.css';

export function CmClientDisabledTab() {
  return (
    <CmCard>
      <div className={styles.container}>
        <div className={styles.iconWrapper}>
          <AlertCircle className={styles.icon} />
        </div>
        <p className={styles.title}>この機能は準備中です</p>
        <p className={styles.description}>
          カイポケスクレイピング実装後に利用可能になります
        </p>
      </div>
    </CmCard>
  );
}
