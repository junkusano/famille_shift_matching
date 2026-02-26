// =============================================================
// src/components/cm-components/clients/ContractRow.tsx
// 利用者詳細 契約タブ - 契約行コンポーネント
// =============================================================

'use client';

import React from 'react';
import { Mic } from 'lucide-react';
import { cmFormatDate } from '@/lib/cm/utils';
import type { CmContractListItem, CmContractStatus } from '@/types/cm/contract';
import { CM_CONTRACT_STATUS_LABELS } from '@/types/cm/contract';
import styles from '@/styles/cm-styles/clients/contractsTab.module.css';

// ステータスカラーマップ（CSS Module用インラインスタイル）
const STATUS_STYLE_MAP: Record<string, React.CSSProperties> = {
  draft:     { backgroundColor: '#f1f5f9', color: '#475569' },
  pending:   { backgroundColor: '#fef3c7', color: '#b45309' },
  sent:      { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  signed:    { backgroundColor: '#d1fae5', color: '#065f46' },
  completed: { backgroundColor: '#dcfce7', color: '#15803d' },
  cancelled: { backgroundColor: '#fef2f2', color: '#b91c1c' },
};

export function ContractRow({
  contract,
  kaipokeCsId,
  hasConsent,
  onPlaudLink,
}: {
  contract: CmContractListItem;
  kaipokeCsId: string;
  hasConsent: boolean;
  onPlaudLink: (contract: CmContractListItem) => void;
}) {
  const status = contract.status as CmContractStatus;
  const statusLabel = CM_CONTRACT_STATUS_LABELS[status] ?? status;
  const statusStyle = STATUS_STYLE_MAP[status] ?? { backgroundColor: '#f1f5f9', color: '#475569' };

  const hasVerification = !!contract.verification_method_id;
  const hasPlaud = !!contract.plaud_recording_id;
  const canStartSigning = status === 'draft';

  return (
    <tr className={styles.contractRow}>
      <td className={styles.cellDate}>{cmFormatDate(contract.created_at)}</td>
      <td className={styles.cellDocCount}>{contract.document_count}点</td>
      <td className={styles.cell}>
        <span className={styles.statusBadge} style={statusStyle}>
          {statusLabel}
        </span>
      </td>
      <td className={styles.cell}>
        {hasVerification ? (
          <span className={styles.verificationDone}>\u2713 入力済</span>
        ) : (
          <span className={styles.verificationNone}>未入力</span>
        )}
      </td>
      <td className={styles.cell}>
        {hasPlaud ? (
          <button
            type="button"
            className={styles.plaudLinked}
            onClick={() => onPlaudLink(contract)}
            title="録音の紐付けを変更"
          >
            \u2713 紐付済
          </button>
        ) : (
          <button
            type="button"
            className={styles.plaudUnlinked}
            onClick={() => onPlaudLink(contract)}
            title="録音を紐付け"
          >
            <Mic className={styles.plaudIcon} />
            紐付け
          </button>
        )}
      </td>
      <td className={styles.cell}>
        <div className={styles.actionButtons}>
          <a
            href={`/cm-portal/clients/${kaipokeCsId}/contracts/${contract.id}`}
            className={styles.detailLink}
          >
            詳細
          </a>
          {canStartSigning && hasConsent && (
            <a
              href={`/cm-portal/clients/${kaipokeCsId}/contracts/${contract.id}/sign`}
              className={styles.signLink}
            >
              署名開始
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
