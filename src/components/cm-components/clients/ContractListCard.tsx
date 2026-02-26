// =============================================================
// src/components/cm-components/clients/ContractListCard.tsx
// 利用者詳細 契約タブ - 契約一覧カード
// =============================================================

'use client';

import React, { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import { getAccessToken } from '@/lib/cm/auth/getAccessToken';
import { updateContract } from '@/lib/cm/contracts/actions';
import { CmContractPlaudSelectModal } from '@/components/cm-components/contracts/CmContractPlaudSelectModal';
import { ContractRow } from './ContractRow';
import type { CmContractListItem } from '@/types/cm/contract';
import styles from '@/styles/cm-styles/clients/contractsTab.module.css';

export function ContractListCard({
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
  // 録音選択モーダル state
  const [plaudModalTarget, setPlaudModalTarget] = useState<CmContractListItem | null>(null);
  const [plaudLinkSubmitting, setPlaudLinkSubmitting] = useState(false);

  // 録音紐付けハンドラ
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
