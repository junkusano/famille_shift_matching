// =============================================================
// src/components/cm-components/clients/CmClientContractsTab.tsx
// 利用者詳細 - 契約タブ
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Mic,
  Plus,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import { getAccessToken } from '@/lib/cm/auth/getAccessToken';
import { cmFormatDate, cmFormatDateTime } from '@/lib/cm/utils';
import { getContracts } from '@/lib/cm/contracts/getContracts';
import { updateContract } from '@/lib/cm/contracts/actions';
import { CmContractPlaudSelectModal } from '@/components/cm-components/contracts/CmContractPlaudSelectModal';
import type {
  CmContractListItem,
  CmContractConsent,
  CmContractStatus,
} from '@/types/cm/contract';
import {
  CM_CONTRACT_STATUS_LABELS,
} from '@/types/cm/contract';
import styles from '@/styles/cm-styles/clients/contractsTab.module.css';

// =============================================================
// Types
// =============================================================

type Props = {
  kaipokeCsId: string;
};
// =============================================================
// ステータスカラーマップ（CSS Module用インラインスタイル）
// =============================================================

const STATUS_STYLE_MAP: Record<string, React.CSSProperties> = {
  draft:     { backgroundColor: '#f1f5f9', color: '#475569' },
  pending:   { backgroundColor: '#fef3c7', color: '#b45309' },
  sent:      { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  signed:    { backgroundColor: '#d1fae5', color: '#065f46' },
  completed: { backgroundColor: '#dcfce7', color: '#15803d' },
  cancelled: { backgroundColor: '#fef2f2', color: '#b91c1c' },
};

// =============================================================
// Component
// =============================================================

export function CmClientContractsTab({ kaipokeCsId }: Props) {
  const [consent, setConsent] = useState<CmContractConsent | null>(null);
  const [contracts, setContracts] = useState<CmContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAccessToken();
      const result = await getContracts(kaipokeCsId, token);

      if (result.ok === false) {
        setError(result.error || '契約情報の取得に失敗しました');
      } else {
        setConsent(result.data.consent);
        setContracts(result.data.contracts);
      }
    } catch {
      setError('契約情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [kaipokeCsId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------
  // ローディング
  // ---------------------------------------------------------
  if (loading) {
    return (
      <CmCard>
        <div className={styles.loadingContainer}>
          <Loader2 className={styles.loadingSpinner} />
          <span className={styles.loadingText}>読み込み中...</span>
        </div>
      </CmCard>
    );
  }

  // ---------------------------------------------------------
  // エラー
  // ---------------------------------------------------------
  if (error) {
    return (
      <CmCard>
        <div className={styles.errorContainer}>
          <AlertCircle className={styles.errorIcon} />
          <span>{error}</span>
        </div>
      </CmCard>
    );
  }

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className={styles.container}>
      <ConsentStatusCard consent={consent} kaipokeCsId={kaipokeCsId} />
      <ContractListCard
        contracts={contracts}
        kaipokeCsId={kaipokeCsId}
        hasConsent={!!consent}
        onContractsChange={setContracts}
      />
    </div>
  );
}

// =============================================================
// 電子契約同意状況カード
// =============================================================

function ConsentStatusCard({
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

// =============================================================
// 契約一覧カード
// =============================================================

function ContractListCard({
  contracts,
  kaipokeCsId,
  hasConsent,
  onContractsChange,
}: {
  contracts: CmContractListItem[];
  kaipokeCsId: string;
  hasConsent: boolean;
  onContractsChange: (contracts: CmContractListItem[]) => void;
}) {
  // ---------------------------------------------------------
  // 録音選択モーダル state
  // ---------------------------------------------------------
  const [plaudModalTarget, setPlaudModalTarget] = useState<CmContractListItem | null>(null);
  const [plaudLinkSubmitting, setPlaudLinkSubmitting] = useState(false);

  // ---------------------------------------------------------
  // 録音紐付けハンドラ
  // ---------------------------------------------------------
  const handlePlaudSelect = useCallback(async (recordingId: number | null) => {
    if (!plaudModalTarget) return;

    try {
      setPlaudLinkSubmitting(true);

      const token = await getAccessToken();
      const result = await updateContract({
        contractId: plaudModalTarget.id,
        plaud_recording_id: recordingId,
      }, token);

      if (result.ok === false) {
        const errorMessage = 'error' in result ? result.error : '更新に失敗しました';
        alert('録音の紐付けに失敗しました: ' + errorMessage);
        return;
      }

      // ローカルステートを更新
      onContractsChange(
        contracts.map((c) =>
          c.id === plaudModalTarget.id
            ? { ...c, plaud_recording_id: recordingId }
            : c
        )
      );

      setPlaudModalTarget(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert('録音の紐付けに失敗しました: ' + msg);
    } finally {
      setPlaudLinkSubmitting(false);
    }
  }, [plaudModalTarget, contracts, onContractsChange]);

  return (
    <>
      <CmCard
        title="契約一覧"
        headerRight={
          <a
            href={`/cm-portal/clients/${kaipokeCsId}/contracts/create`}
            className={styles.createButton}
          >
            <Plus className={styles.createButtonIcon} />
            契約書類を作成
          </a>
        }
        noPadding
      >
        {contracts.length === 0 ? (
          <div className={styles.emptyContainer}>
            <p className={styles.emptyText}>契約がありません</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.tableHead}>
                  <th className={styles.tableHeadCell}>作成日</th>
                  <th className={styles.tableHeadCell}>書類</th>
                  <th className={styles.tableHeadCell}>状態</th>
                  <th className={styles.tableHeadCell}>本人確認</th>
                  <th className={styles.tableHeadCell}>録音</th>
                  <th className={styles.tableHeadCell}>操作</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <ContractRow
                    key={contract.id}
                    contract={contract}
                    kaipokeCsId={kaipokeCsId}
                    hasConsent={hasConsent}
                    onPlaudLink={setPlaudModalTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CmCard>

      {/* 録音選択モーダル */}
      <CmContractPlaudSelectModal
        isOpen={plaudModalTarget !== null}
        onClose={() => {
          if (!plaudLinkSubmitting) {
            setPlaudModalTarget(null);
          }
        }}
        onSelect={handlePlaudSelect}
        kaipokeCsId={kaipokeCsId}
        currentRecordingId={plaudModalTarget?.plaud_recording_id ?? null}
        submitting={plaudLinkSubmitting}
      />
    </>
  );
}

// =============================================================
// 契約行
// =============================================================

function ContractRow({
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
          <span className={styles.verificationDone}>✓ 入力済</span>
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
            ✓ 紐付済
          </button>
        ) : (
          <button
            type="button"
            className={styles.plaudUnlinked}
            onClick={() => onPlaudLink(contract)}
            title="録音を紐付ける"
          >
            紐付け
          </button>
        )}
      </td>
      <td className={styles.actionCell}>
        {canStartSigning && (
          <a
            href={`/cm-portal/clients/${kaipokeCsId}/contracts/${contract.id}/sign`}
            className={hasConsent ? styles.signButtonConsented : styles.signButtonUnconsented}
            title={hasConsent ? '署名を開始' : '同意未取得（署名は開始できます）'}
          >
            署名開始
          </a>
        )}
        <a
          href={`/cm-portal/clients/${kaipokeCsId}/contracts/${contract.id}`}
          className={styles.detailLink}
        >
          詳細
        </a>
      </td>
    </tr>
  );
}