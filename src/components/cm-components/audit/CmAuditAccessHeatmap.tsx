// =============================================================
// src/components/cm-components/audit/CmAuditAccessHeatmap.tsx
// 曜日×時間帯アクセス分布ヒートマップ
// =============================================================

'use client';

import React from 'react';
import { cmAuditHeatmapColor } from '@/lib/cm/audit/dashboardAggregation';
import type { CmAuditHeatmapCell } from '@/types/cm/auditDashboard';
import styles from '@/styles/cm-styles/components/auditDashboard.module.css';

// =============================================================
// 型定義
// =============================================================

type Props = {
  data: CmAuditHeatmapCell[];
};

// =============================================================
// コンポーネント
// =============================================================

export function CmAuditAccessHeatmap({ data }: Props) {
  const days = ['月', '火', '水', '木', '金', '土', '日'];
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={styles.heatmapWrap}>
      <div className={styles.heatmapInner}>
        <div className={styles.heatmapHourLabels}>
          {hours.map((h) => (
            <div key={h} className={styles.heatmapHourLabel}>{h}</div>
          ))}
        </div>
        {days.map((day, di) => (
          <div key={day} className={styles.heatmapRow}>
            <div className={styles.heatmapDayLabel}>{day}</div>
            {hours.map((h) => {
              const cell = data.find((d) => d.dayIndex === di && d.hour === h);
              const count = cell?.count ?? 0;
              const intensity = maxCount > 0 ? count / maxCount : 0;
              const { bg, text } = cmAuditHeatmapColor(intensity);
              return (
                <div key={h} className={styles.heatmapCellWrap}>
                  <div
                    className={styles.heatmapCell}
                    style={{ backgroundColor: bg, color: text }}
                    title={`${count}件`}
                  >
                    {count > 0 ? count : ''}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className={styles.heatmapLegend}>
          <span className={styles.heatmapLegendLabel}>少</span>
          {['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1e40af'].map((c) => (
            <div key={c} className={styles.heatmapLegendSwatch} style={{ backgroundColor: c }} />
          ))}
          <span className={styles.heatmapLegendLabel}>多</span>
        </div>
      </div>
    </div>
  );
}
