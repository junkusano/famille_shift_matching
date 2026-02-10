// =============================================================
// src/components/cm-components/plaud/CmPlaudTranscriptionList.tsx
// 文字起こし一覧コンポーネント
// =============================================================

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  X,
  CheckCircle,
  RefreshCw,
  FileText,
  Wand2,
} from 'lucide-react';
import { usePlaudTranscriptions } from '@/hooks/cm/plaud/usePlaudTranscriptions';
import {
  CmPlaudTranscription,
  CmPlaudTranscriptionStatus,
  CM_PLAUD_STATUS_LABELS,
  getCmPlaudRetryMessage,
  CmClient,
} from '@/types/cm/plaud';
import {
  LoadingSpinner,
  ErrorMessage,
  EmptyState,
  StatusBadge,
  Pagination,
} from './CmPlaudCommon';
import { CmPlaudClientSearchModal } from './CmPlaudClientSearchModal';
import styles from '@/styles/cm-styles/plaud/transcriptionList.module.css';

// =============================================================
// 型定義
// =============================================================

type CmPlaudTranscriptionListProps = {
  onOpenDetail: (item: CmPlaudTranscription) => void;
  onOpenProcess: (item: CmPlaudTranscription) => void;
};

// =============================================================
// コンポーネント
// =============================================================

export const CmPlaudTranscriptionList: React.FC<CmPlaudTranscriptionListProps> = ({
  onOpenDetail,
  onOpenProcess,
}) => {
  const {
    transcriptions,
    pagination,
    counts,
    filters,
    setFilters,
    resetFilters,
    page,
    setPage,
    isLoading,
    error,
    refresh,
    approve,
    approveBulk,
    retry,
    updateClient,
  } = usePlaudTranscriptions();

  // フィルター展開状態
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // 利用者検索モーダル
  const [clientSearchTarget, setClientSearchTarget] = useState<CmPlaudTranscription | null>(null);

  // ★ 複数選択状態
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ★ 一括承認処理中
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  // ★ ページ切り替え・フィルター変更時に選択をクリア
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, filters]);

  // ★ 現在表示中のpendingアイテムのID一覧
  const pendingIds = transcriptions
    .filter((t) => t.status === 'pending')
    .map((t) => t.id);

  // ★ 全選択状態の判定
  const isAllSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.has(id));
  const isPartialSelected = pendingIds.some((id) => selectedIds.has(id)) && !isAllSelected;

  // ★ チェックボックス: 個別トグル
  const handleToggleSelect = useCallback((id: number, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ★ チェックボックス: 全選択/全解除
  const handleToggleAll = useCallback(() => {
    if (isAllSelected) {
      // 全解除
      setSelectedIds(new Set());
    } else {
      // 表示中のpendingをすべて選択
      setSelectedIds(new Set(pendingIds));
    }
  }, [isAllSelected, pendingIds]);

  // ★ 一括承認
  const handleBulkApprove = useCallback(async () => {
    const ids = Array.from(selectedIds).filter((id) =>
      transcriptions.some((t) => t.id === id && t.status === 'pending')
    );

    if (ids.length === 0) return;

    const message = `${ids.length}件を一括承認しますか？\n\n承認すると、次回のChrome拡張実行時に文字起こしデータが取得されます。`;
    if (!window.confirm(message)) return;

    setIsBulkApproving(true);
    try {
      await approveBulk(ids);
      setSelectedIds(new Set());
    } finally {
      setIsBulkApproving(false);
    }
  }, [selectedIds, transcriptions, approveBulk]);

  // ★ 選択中のpending件数
  const selectedPendingCount = Array.from(selectedIds).filter((id) =>
    transcriptions.some((t) => t.id === id && t.status === 'pending')
  ).length;

  // ステータスフィルター変更
  const handleStatusFilter = (status: CmPlaudTranscriptionStatus | 'all') => {
    setFilters({ ...filters, status });
    setPage(1);
  };

  // 検索入力変更
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ ...filters, search: e.target.value });
  };

  // 検索実行
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    refresh();
  };

  // 承認処理
  const handleApprove = async (item: CmPlaudTranscription, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`「${item.title}」を承認しますか？\n\n承認すると、次回のChrome拡張実行時に文字起こしデータが取得されます。`)) {
      await approve(item.id);
    }
  };

  // リトライ処理
  const handleRetry = async (item: CmPlaudTranscription, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`「${item.title}」をリトライしますか？`)) {
      await retry(item.id);
    }
  };

  // 利用者紐付け
  const handleClientSelect = async (client: CmClient) => {
    if (clientSearchTarget && client.kaipoke_cs_id) {
      await updateClient(clientSearchTarget.id, client.kaipoke_cs_id);
    }
    setClientSearchTarget(null);
  };

  // 利用者解除
  const handleClientClear = async (item: CmPlaudTranscription, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateClient(item.id, null);
  };

  // 日付フォーマット
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.container}>
      {/* ステータスタブ */}
      <div className={styles.statusTabs}>
        {(['all', 'pending', 'approved', 'completed', 'failed'] as const).map((status) => (
          <button
            key={status}
            className={`${styles.statusTab} ${
              filters.status === status ? styles.statusTabActive : ''
            }`}
            onClick={() => handleStatusFilter(status)}
          >
            {status === 'all' ? 'すべて' : CM_PLAUD_STATUS_LABELS[status].label}
            <span className={styles.statusCount}>
              {status === 'all' ? counts.all : counts[status]}
            </span>
          </button>
        ))}
      </div>

      {/* 検索・フィルター */}
      <div className={styles.searchArea}>
        <form className={styles.searchForm} onSubmit={handleSearchSubmit}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="タイトルで検索..."
            value={filters.search}
            onChange={handleSearchChange}
          />
        </form>

        <button
          className={styles.filterToggle}
          onClick={() => setIsFilterOpen(!isFilterOpen)}
        >
          <Filter size={18} />
          詳細フィルター
          {isFilterOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        <button className={styles.refreshButton} onClick={refresh} disabled={isLoading}>
          <RefreshCw size={18} className={isLoading ? styles.spinning : ''} />
        </button>
      </div>

      {/* 詳細フィルター */}
      {isFilterOpen && (
        <div className={styles.filterPanel}>
          <div className={styles.filterRow}>
            <label className={styles.filterLabel}>録音日</label>
            <input
              type="date"
              className={styles.filterInput}
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
            <span className={styles.filterSeparator}>〜</span>
            <input
              type="date"
              className={styles.filterInput}
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />
          </div>
          <button className={styles.filterResetButton} onClick={resetFilters}>
            フィルターをリセット
          </button>
        </div>
      )}

      {/* ★ 一括承認バー（選択中のみ表示） */}
      {selectedPendingCount > 0 && (
        <div className={styles.bulkActionBar}>
          <span className={styles.bulkActionText}>
            {selectedPendingCount}件選択中
          </span>
          <button
            className={styles.bulkApproveButton}
            onClick={handleBulkApprove}
            disabled={isBulkApproving}
          >
            {isBulkApproving ? (
              <RefreshCw size={16} className={styles.spinning} />
            ) : (
              <CheckCircle size={16} />
            )}
            {isBulkApproving ? '承認中...' : '一括承認'}
          </button>
          <button
            className={styles.bulkCancelButton}
            onClick={() => setSelectedIds(new Set())}
          >
            選択解除
          </button>
        </div>
      )}

      {/* コンテンツ */}
      <div className={styles.content}>
        {isLoading ? (
          <LoadingSpinner message="読み込み中..." />
        ) : error ? (
          <ErrorMessage message={error} onRetry={refresh} />
        ) : transcriptions.length === 0 ? (
          <EmptyState
            message="文字起こしデータがありません"
            icon={<FileText size={48} />}
          />
        ) : (
          <>
            {/* ★ リストヘッダー */}
            <div className={styles.listHeader}>
              <div className={styles.listHeaderCheckbox}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isPartialSelected;
                  }}
                  onChange={handleToggleAll}
                  disabled={pendingIds.length === 0}
                  title={pendingIds.length === 0 ? '承認待ちのデータがありません' : '待機中をすべて選択'}
                />
              </div>
              <div className={styles.listHeaderTitle}>タイトル</div>
              <div className={styles.listHeaderDate}>Plaud録音日時</div>
            </div>

            {/* 一覧 */}
            <div className={styles.list}>
              {transcriptions.map((item) => {
                const isPending = item.status === 'pending';
                const isSelected = selectedIds.has(item.id);

                return (
                  <div
                    key={item.id}
                    className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
                    onClick={() => onOpenDetail(item)}
                  >
                    {/* ★ チェックボックス */}
                    <div className={styles.cardCheckbox}>
                      {isPending ? (
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={isSelected}
                          onChange={(e) => handleToggleSelect(item.id, e)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className={styles.checkboxPlaceholder} />
                      )}
                    </div>

                    {/* カード本体 */}
                    <div className={styles.cardBody}>
                      {/* カードヘッダー */}
                      <div className={styles.cardHeader}>
                        <div className={styles.cardTitle}>
                          <span className={styles.title}>{item.title}</span>
                          <StatusBadge status={item.status} />
                          {item.client_name && (
                            <span className={styles.clientBadge}>
                              <User size={12} />
                              {item.client_name}
                              <button
                                className={styles.clientClearButton}
                                onClick={(e) => handleClientClear(item, e)}
                                title="利用者を解除"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          )}
                        </div>
                        <span className={styles.date}>
                          {formatDate(item.plaud_created_at)}
                        </span>
                      </div>

                      {/* リトライメッセージ */}
                      {item.status === 'approved' && item.retry_count > 0 && (
                        <div className={styles.retryMessage}>
                          ⚠️ {getCmPlaudRetryMessage(item.retry_count)}
                        </div>
                      )}

                      {/* カードアクション */}
                      <div className={styles.cardActions}>
                        {/* 利用者紐付け */}
                        <button
                          className={styles.actionButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            setClientSearchTarget(item);
                          }}
                          title="利用者を紐付け"
                        >
                          <User size={16} />
                          {item.client_name ? '変更' : '紐付け'}
                        </button>

                        {/* ステータス別アクション */}
                        {item.status === 'pending' && (
                          <button
                            className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                            onClick={(e) => handleApprove(item, e)}
                          >
                            <CheckCircle size={16} />
                            承認
                          </button>
                        )}

                        {item.status === 'failed' && (
                          <button
                            className={`${styles.actionButton} ${styles.actionButtonWarning}`}
                            onClick={(e) => handleRetry(item, e)}
                          >
                            <RefreshCw size={16} />
                            リトライ
                          </button>
                        )}

                        {item.status === 'completed' && item.transcript && (
                          <button
                            className={`${styles.actionButton} ${styles.actionButtonSuccess}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProcess(item);
                            }}
                          >
                            <Wand2 size={16} />
                            二次利用
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ページネーション */}
            {pagination && (
              <Pagination
                page={page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
                hasNext={pagination.hasNext}
                hasPrev={pagination.hasPrev}
              />
            )}
          </>
        )}
      </div>

      {/* 利用者検索モーダル */}
      <CmPlaudClientSearchModal
        isOpen={clientSearchTarget !== null}
        onClose={() => setClientSearchTarget(null)}
        onSelect={handleClientSelect}
        currentKaipokeCsId={clientSearchTarget?.kaipoke_cs_id}
      />
    </div>
  );
};