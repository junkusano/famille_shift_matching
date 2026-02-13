// =============================================================
// src/components/cm-components/clients/CmClientDetailTabs.tsx
// 利用者詳細 - タブナビゲーション
// =============================================================

'use client';

import React from 'react';
import {
  User,
  Shield,
  Calculator,
  Wallet,
  Percent,
  MapPin,
  Heart,
  FolderOpen,
  FileSignature,
} from 'lucide-react';
import { CM_TABS, type CmTabId } from '@/types/cm/clientDetail';
import styles from '@/styles/cm-styles/clients/detailTabs.module.css';

const iconMap = {
  User,
  Shield,
  Calculator,
  Wallet,
  Percent,
  MapPin,
  Heart,
  FolderOpen,
  FileSignature,
} as const;

type Props = {
  activeTab: CmTabId;
  onTabChange: (tabId: CmTabId) => void;
};

export function CmClientDetailTabs({ activeTab, onTabChange }: Props) {
  return (
    <div className={styles.tabContainer}>
      <nav className={styles.tabNav}>
        {CM_TABS.map((tab) => {
          const Icon = iconMap[tab.icon as keyof typeof iconMap];
          const isActive = activeTab === tab.id;
          const isDisabled = 'disabled' in tab && tab.disabled;

          const buttonClass = isActive
            ? styles.tabButtonActive
            : isDisabled
            ? styles.tabButtonDisabled
            : styles.tabButtonDefault;

          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && onTabChange(tab.id)}
              disabled={isDisabled}
              className={buttonClass}
            >
              <Icon className={styles.tabIcon} />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
