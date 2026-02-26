// =============================================================
// src/components/cm-components/clients/ConsentStatusCard.tsx
// 利用者詳細 契約タブ - 電子契約同意状況カード
// =============================================================

'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Mic,
  FileText,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import { cmFormatDateTime } from '@/lib/cm/utils';
import type { CmContractConsent } from '@/types/cm/contract';
import styles from '@/styles/cm-styles/clients/contractsTab.module.css';

export function ConsentStatusCard({
  consent,
  kaipokeCsId,
}: {
  consent: CmContractConsent | null;
  kaipokeCsId: string;
}) {
  if (consent) {
    return (
      <CmCard title="電子契約同意状況">
        <div className={styles.consentContent}>
          <div className={styles.consentItems}>
            {consent.consent_electronic && (
              <div className={styles.consentItem}>
                <div className={styles.consentIconWrapper}>
                  <CheckCircle2 className={styles.consentIcon} />
                </div>
                <div>
                  <p className={styles.consentLabel}>電子契約同意済み</p>
                  <p className={styles.consentDate}>{cmFormatDateTime(consent.consented_at)}</p>
                </div>
              </div>
            )}
            {consent.consent_recording && (
              <div className={styles.consentItem}>
                <div className={styles.consentIconWrapper}>
                  <Mic className={styles.consentIcon} />
                </div>
                <div>
                  <p className={styles.consentLabel}>録音同意済み</p>
                  <p className={styles.consentDate}>{cmFormatDateTime(consent.consented_at)}</p>
                </div>
              </div>
            )}
          </div>
          {/* PDF表示リンク */}
          {consent.gdrive_file_url && (
            <a
              href={consent.gdrive_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.consentPdfLink}
            >
              <FileText className={styles.consentPdfIcon} />
              同意書PDFを表示
            </a>
          )}
        </div>
      </CmCard>
    );
  }

  return (
    <CmCard title="電子契約同意状況">
      <div className={styles.unconsentedContent}>
        <div className={styles.unconsentedItem}>
          <div className={styles.unconsentedIconWrapper}>
            <AlertTriangle className={styles.unconsentedIcon} />
          </div>
          <div>
            <p className={styles.unconsentedLabel}>未同意</p>
            <p className={styles.unconsentedHint}>署名前に同意の取得が必要です</p>
          </div>
        </div>
        <a
          href={`/cm-portal/clients/${kaipokeCsId}/consent`}
          className={styles.consentButton}
        >
          同意を取得する →
        </a>
      </div>
    </CmCard>
  );
}
