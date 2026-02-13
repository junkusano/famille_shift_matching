// =============================================================
// src/components/cm-components/clients/CmClientDetailRow.tsx
// 詳細表示の共通行コンポーネント
// =============================================================

'use client';

import React from 'react';
import styles from '@/styles/cm-styles/clients/detailRow.module.css';

type Props = {
  label: string;
  value?: string | number | null;
  subValue?: string;
  mono?: boolean;
  link?: string;
  icon?: React.ReactNode;
};

export function CmClientDetailRow({
  label,
  value,
  subValue,
  mono,
  link,
  icon,
}: Props) {
  return (
    <div>
      <dt className={styles.label}>{label}</dt>
      <dd className={mono ? styles.valueMono : styles.value}>
        {link && value ? (
          <a href={link} className={styles.link}>
            {icon}
            {value}
          </a>
        ) : (
          value ?? '-'
        )}
        {subValue && <span className={styles.subValue}>({subValue})</span>}
      </dd>
    </div>
  );
}
