// =============================================================
// src/components/cm-components/clients/CmClientDocumentsTab.tsx
// 利用者詳細 - 書類管理タブ
// =============================================================

'use client';

import React from 'react';
import { FileText, FolderOpen, ExternalLink } from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import type { CmDocument } from '@/types/cm/clientDetail';
import styles from '@/styles/cm-styles/clients/documentsTab.module.css';

type Props = {
  documents: CmDocument[] | null;
};

export function CmClientDocumentsTab({ documents }: Props) {
  const docs = documents ?? [];

  if (docs.length === 0) {
    return (
      <CmCard>
        <div className={styles.emptyContainer}>
          <FolderOpen className={styles.emptyIcon} />
          <p className={styles.emptyText}>書類がありません</p>
          <button className={styles.addButton}>
            書類を追加
          </button>
        </div>
      </CmCard>
    );
  }

  return (
    <CmCard title="書類一覧">
      <div className={styles.docGrid}>
        {docs.map((doc) => (
          <div key={doc.id} className={styles.docCard}>
            <div className={styles.docCardInner}>
              <FileText className={styles.docIcon} />
              <div className={styles.docContent}>
                <p className={styles.docLabel}>
                  {doc.label || '書類'}
                </p>
                <p className={styles.docType}>
                  {doc.type || '種別未設定'}
                </p>
                {doc.acquired_at && (
                  <p className={styles.docDate}>
                    取得日: {doc.acquired_at}
                  </p>
                )}
              </div>
            </div>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.viewLink}
              >
                <ExternalLink className={styles.viewLinkIcon} />
                表示
              </a>
            )}
          </div>
        ))}
      </div>
    </CmCard>
  );
}
