// =============================================================
// src/components/cm-components/clients/CmClientFilters.tsx
// 利用者一覧 - 検索フィルター
// =============================================================

'use client';

import React from 'react';
import { Search } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import type { CmClientFilters as CmClientFiltersType } from '@/types/cm/clients';
import styles from '@/styles/cm-styles/clients/clientFilters.module.css';

type Props = {
  filters: CmClientFiltersType;
  insurerOptions: string[];
  onFilterChange: (key: keyof CmClientFiltersType, value: string) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function CmClientFilters({
  filters,
  insurerOptions,
  onFilterChange,
  onSearch,
  onReset,
}: Props) {
  return (
    <CmCard title="検索条件">
      <div className={styles.filterGrid}>
        {/* 利用者名検索 */}
        <div>
          <label className={styles.fieldLabel}>利用者名</label>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            placeholder="氏名・カナ・ふりがなで検索"
            className={styles.input}
          />
        </div>

        {/* ステータス */}
        <div>
          <label className={styles.fieldLabel}>利用者状態</label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange('status', e.target.value)}
            className={styles.select}
          >
            <option value="">すべて</option>
            <option value="active">利用中</option>
            <option value="inactive">利用停止</option>
          </select>
        </div>

        {/* 保険者 */}
        <div>
          <label className={styles.fieldLabel}>保険者</label>
          <select
            value={filters.insurer}
            onChange={(e) => onFilterChange('insurer', e.target.value)}
            className={styles.select}
          >
            <option value="">すべて</option>
            {insurerOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* ボタン */}
        <div className={styles.buttonGroup}>
          <button onClick={onSearch} className={styles.searchButton}>
            <Search className={styles.searchIcon} />
            検索
          </button>
          <button onClick={onReset} className={styles.resetButton}>
            リセット
          </button>
        </div>
      </div>
    </CmCard>
  );
}
