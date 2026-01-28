// =============================================================
// src/app/cm-portal/plaud/page.tsx
// Plaud文字起こし管理画面
// =============================================================

'use client';

import React, { useState } from 'react';
import { FileText, History, Settings } from 'lucide-react';
import { CmPlaudTranscriptionList } from '@/components/cm-components/plaud/CmPlaudTranscriptionList';
import { CmPlaudHistoryList } from '@/components/cm-components/plaud/CmPlaudHistoryList';
import { CmPlaudTemplateManager } from '@/components/cm-components/plaud/CmPlaudTemplateManager';
import { CmPlaudDetailModal } from '@/components/cm-components/plaud/CmPlaudDetailModal';
import { CmPlaudProcessModal } from '@/components/cm-components/plaud/CmPlaudProcessModal';
import { CmPlaudTranscription, CmPlaudTabType } from '@/types/cm/plaud';
import styles from '@/styles/cm-styles/plaud/page.module.css';

// =============================================================
// タブ定義
// =============================================================

const TABS: { id: CmPlaudTabType; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  {
    id: 'transcriptions',
    label: '文字起こし',
    icon: FileText,
  },
  {
    id: 'history',
    label: '処理履歴',
    icon: History,
  },
  {
    id: 'templates',
    label: 'テンプレート',
    icon: Settings,
  },
];

// =============================================================
// メインコンポーネント
// =============================================================

export default function CmPlaudPage() {
  // タブ状態
  const [activeTab, setActiveTab] = useState<CmPlaudTabType>('transcriptions');

  // 詳細モーダル
  const [detailTarget, setDetailTarget] = useState<CmPlaudTranscription | null>(null);

  // 二次利用モーダル
  const [processTarget, setProcessTarget] = useState<CmPlaudTranscription | null>(null);

  return (
    <div className={styles.container}>
      {/* ページヘッダー */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Plaud文字起こし管理</h1>
        <p className={styles.pageDescription}>
          録音データの文字起こし確認・承認、AI二次利用を行います
        </p>
      </div>

      {/* タブナビゲーション */}
      <div className={styles.tabNav}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`${styles.tabButton} ${
                activeTab === tab.id ? styles.tabButtonActive : ''
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* タブコンテンツ */}
      <div className={styles.tabContent}>
        {activeTab === 'transcriptions' && (
          <CmPlaudTranscriptionList
            onOpenDetail={(item) => setDetailTarget(item)}
            onOpenProcess={(item) => setProcessTarget(item)}
          />
        )}
        {activeTab === 'history' && <CmPlaudHistoryList />}
        {activeTab === 'templates' && <CmPlaudTemplateManager />}
      </div>

      {/* 詳細モーダル */}
      <CmPlaudDetailModal
        isOpen={detailTarget !== null}
        item={detailTarget}
        onClose={() => setDetailTarget(null)}
        onOpenProcess={(item) => {
          setDetailTarget(null);
          setProcessTarget(item);
        }}
      />

      {/* 二次利用モーダル */}
      <CmPlaudProcessModal
        isOpen={processTarget !== null}
        item={processTarget}
        onClose={() => setProcessTarget(null)}
      />
    </div>
  );
}