// =============================================================
// src/components/cm-components/clients/CmClientTable.tsx
// 利用者一覧 - テーブル
// =============================================================

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Users, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import {
  cmFormatAddress,
  cmCalculateAge,
  cmGetCareLevelDisplay,
} from '@/lib/cm/utils';
import type { CmClientInfo, CmPagination } from '@/types/cm/clients';
import styles from '@/styles/cm-styles/clients/clientTable.module.css';

type Props = {
  clients: CmClientInfo[];
  pagination: CmPagination | null;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
};

export function CmClientTable({
  clients,
  pagination,
  loading,
  error,
  onPageChange,
}: Props) {
  const router = useRouter();

  const handleSelectClient = (client: CmClientInfo) => {
    router.push(`/cm-portal/clients/${client.kaipoke_cs_id}`);
  };

  return (
    <>
      {/* エラー表示 */}
      {error && (
        <div className={styles.errorBanner}>
          <AlertCircle className={styles.errorIcon} />
          {error}
        </div>
      )}

      <CmCard noPadding>
        {loading ? (
          <div className={styles.loadingContainer}>読み込み中...</div>
        ) : clients.length === 0 ? (
          <div className={styles.emptyContainer}>
            <Users className={styles.emptyIcon} />
            <p className={styles.emptyText}>該当する利用者がありません</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th className={styles.tableHeadCell}>氏名</th>
                  <th className={styles.tableHeadCell}>性別</th>
                  <th className={styles.tableHeadCell}>生年月日</th>
                  <th className={styles.tableHeadCell}>要介護度</th>
                  <th className={styles.tableHeadCell}>住所</th>
                  <th className={styles.tableHeadCell}>電話番号</th>
                  <th className={styles.tableHeadCell}>契約日</th>
                  <th className={styles.tableHeadCell}>状態</th>
                  <th className={styles.tableHeadCell}>操作</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const careLevelDisplay = cmGetCareLevelDisplay(client.insurances);
                  const age = cmCalculateAge(client.birth_date);
                  const isActive = client.client_status === '利用中';

                  return (
                    <tr
                      key={client.id}
                      className={styles.tableRow}
                      onClick={() => handleSelectClient(client)}
                    >
                      <td className={styles.cell}>
                        <div className={styles.cellName}>{client.name}</div>
                        <div className={styles.cellKana}>{client.kana}</div>
                      </td>
                      <td className={`${styles.cell} ${styles.cellText}`}>
                        {client.gender ?? '-'}
                      </td>
                      <td className={styles.cell}>
                        <div className={styles.cellText}>
                          {client.birth_date ?? '-'}
                        </div>
                        {age && <div className={styles.cellAge}>{age}歳</div>}
                      </td>
                      <td className={styles.cell}>
                        <span className={styles.careLevelBadge} style={careLevelInlineStyle(careLevelDisplay.style)}>
                          {careLevelDisplay.text}
                        </span>
                      </td>
                      <td className={`${styles.cell} ${styles.cellAddress}`}>
                        {cmFormatAddress(client) || '-'}
                      </td>
                      <td className={`${styles.cell} ${styles.cellText}`}>
                        {client.phone_01 ?? '-'}
                      </td>
                      <td className={`${styles.cell} ${styles.cellText}`}>
                        {client.contract_date ?? '-'}
                      </td>
                      <td className={styles.cell}>
                        <span className={isActive ? styles.statusBadgeActive : styles.statusBadgeInactive}>
                          <span className={isActive ? styles.statusDotActive : styles.statusDotInactive} />
                          {client.client_status ?? '不明'}
                        </span>
                      </td>
                      <td className={styles.cell}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectClient(client);
                          }}
                          className={styles.detailLink}
                        >
                          詳細 →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ページネーション */}
        {pagination && pagination.totalPages > 1 && (
          <div className={styles.pagination}>
            <div className={styles.paginationInfo}>
              全 {pagination.total} 件中 {(pagination.page - 1) * pagination.limit + 1} -{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} 件
            </div>
            <div className={styles.paginationControls}>
              <button
                onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
                disabled={!pagination.hasPrev}
                className={styles.paginationButton}
              >
                <ChevronLeft className={styles.paginationIcon} />
              </button>
              <span className={styles.paginationText}>
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={!pagination.hasNext}
                className={styles.paginationButton}
              >
                <ChevronRight className={styles.paginationIcon} />
              </button>
            </div>
          </div>
        )}
      </CmCard>
    </>
  );
}

// =============================================================
// ヘルパー: Tailwindクラス文字列をインラインスタイルに変換
// =============================================================

function careLevelInlineStyle(tailwindClass: string): React.CSSProperties {
  if (tailwindClass.includes('bg-red')) return { backgroundColor: '#fef2f2', color: '#b91c1c' };
  if (tailwindClass.includes('bg-orange')) return { backgroundColor: '#fff7ed', color: '#c2410c' };
  if (tailwindClass.includes('bg-amber')) return { backgroundColor: '#fffbeb', color: '#b45309' };
  if (tailwindClass.includes('bg-yellow')) return { backgroundColor: '#fefce8', color: '#a16207' };
  if (tailwindClass.includes('bg-green')) return { backgroundColor: '#f0fdf4', color: '#15803d' };
  if (tailwindClass.includes('bg-blue')) return { backgroundColor: '#eff6ff', color: '#1d4ed8' };
  return { backgroundColor: '#f1f5f9', color: '#475569' };
}
