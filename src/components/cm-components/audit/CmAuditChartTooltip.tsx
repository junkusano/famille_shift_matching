// =============================================================
// src/components/cm-components/audit/CmAuditChartTooltip.tsx
// 監査ダッシュボード用 recharts ツールチップ
// =============================================================

'use client';

import React from 'react';
import styles from '@/styles/cm-styles/components/auditDashboard.module.css';

// =============================================================
// 型定義
// =============================================================

type CmAuditTooltipPayload = {
  name: string;
  value: number;
  color: string;
};

type CmAuditChartTooltipProps = {
  active?: boolean;
  payload?: CmAuditTooltipPayload[];
  label?: string;
};

// =============================================================
// コンポーネント
// =============================================================

export function CmAuditChartTooltip({ active, payload, label }: CmAuditChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className={styles.tooltipRow}>
          <div className={styles.tooltipDot} style={{ backgroundColor: p.color }} />
          <span className={styles.tooltipName}>{p.name}:</span>
          <span className={styles.tooltipValue}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}
