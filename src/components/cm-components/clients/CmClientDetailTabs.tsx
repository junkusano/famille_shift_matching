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
} from 'lucide-react';
import { CM_TABS, type CmTabId } from '@/types/cm/clientDetail';

const iconMap = {
  User,
  Shield,
  Calculator,
  Wallet,
  Percent,
  MapPin,
  Heart,
  FolderOpen,
} as const;

type Props = {
  activeTab: CmTabId;
  onTabChange: (tabId: CmTabId) => void;
};

export function CmClientDetailTabs({ activeTab, onTabChange }: Props) {
  return (
    <div className="border-b border-slate-200">
      <nav className="flex gap-1 overflow-x-auto">
        {CM_TABS.map((tab) => {
          const Icon = iconMap[tab.icon as keyof typeof iconMap];
          const isActive = activeTab === tab.id;
          const isDisabled = 'disabled' in tab && tab.disabled;

          return (
            <button
              key={tab.id}
              onClick={() => !isDisabled && onTabChange(tab.id)}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : isDisabled
                  ? 'border-transparent text-slate-300 cursor-not-allowed'
                  : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}