// =============================================================
// src/components/cm-components/plaud/CmPlaudHistoryList.tsx
// 処理履歴一覧コンポーネント
// =============================================================

'use client';

import React, { useState } from 'react';
import { Clock, User, Trash2, Edit, X, Save } from 'lucide-react';
import { usePlaudHistory } from '@/hooks/cm/plaud/usePlaudHistory';
import { CmPlaudProcessHistoryWithDetails } from '@/types/cm/plaud';
import {
  LoadingSpinner,
  ErrorMessage,
  EmptyState,
  Pagination,
  CopyButton,
} from './CmPlaudCommon';
import styles from '@/styles/cm-styles/plaud/historyList.module.css';
import { cmFormatDateTimeLocale } from '@/lib/cm/utils';

// =============================================================
// コンポーネント
// =============================================================

export const CmPlaudHistoryList: React.FC = () => {
  const {
    history,
    pagination,
    isLoading,
    error,
    page,
    setPage,
    refresh,
    update,
    remove,
  } = usePlaudHistory();

  // 詳細表示中のアイテム
  const [selectedItem, setSelectedItem] = useState<CmPlaudProcessHistoryWithDetails | null>(null);

  // 編集モード
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  // 詳細を開く
  const openDetail = (item: CmPlaudProcessHistoryWithDetails) => {
    setSelectedItem(item);
    setIsEditing(false);
    setEditText(item.output_text);
  };

  // 詳細を閉じる
  const closeDetail = () => {
    setSelectedItem(null);
    setIsEditing(false);
  };

  // 編集モード開始
  const startEditing = () => {
    if (selectedItem) {
      setEditText(selectedItem.output_text);
      setIsEditing(true);
    }
  };

  // 編集保存
  const handleSave = async () => {
    if (!selectedItem) return;

    const updated = await update(selectedItem.id, { output_text: editText });
    if (updated) {
      setSelectedItem((prev) =>
        prev ? { ...prev, output_text: editText } : null
      );
      setIsEditing(false);
    }
  };

  // 削除
  const handleDelete = async (item: CmPlaudProcessHistoryWithDetails, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (window.confirm('この処理履歴を削除してもよろしいですか？')) {
      const success = await remove(item.id);
      if (success && selectedItem?.id === item.id) {
        closeDetail();
      }
    }
  };

  // 日付フォーマット


  return (
    <div className={styles.container}>
      {/* コンテンツ */}
      <div className={styles.content}>
        {isLoading ? (
          <LoadingSpinner message="読み込み中..." />
        ) : error ? (
          <ErrorMessage message={error} onRetry={refresh} />
        ) : history.length === 0 ? (
          <EmptyState
            message="処理履歴がありません"
            icon={<Clock size={48} />}
          />
        ) : (
          <>
            {/* 一覧 */}
            <div className={styles.list}>
              {history.map((item) => (
                <div
                  key={item.id}
                  className={styles.historyCard}
                  onClick={() => openDetail(item)}
                >
                  <div className={styles.historyHeader}>
                    <div className={styles.historyTitle}>
                      <span className={styles.templateIcon}>
                        📋
                      </span>
                      <span className={styles.templateName}>
                        {item.template_name}
                      </span>
                      <span className={styles.transcriptionTitle}>
                        [{item.transcription_title}]
                      </span>
                      {item.client_name && (
                        <span className={styles.clientBadge}>
                          <User size={12} />
                          {item.client_name}
                        </span>
                      )}
                    </div>
                    <div className={styles.historyActions}>
                      <button
                        className={styles.deleteButton}
                        onClick={(e) => handleDelete(item, e)}
                        title="削除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className={styles.historyMeta}>
                    <Clock size={12} />
                    <span>{cmFormatDateTimeLocale(item.processed_at)}</span>
                    {item.updated_at && (
                      <span className={styles.editedBadge}>（編集済み）</span>
                    )}
                  </div>
                  <div className={styles.historyPreview}>
                    {item.output_text.slice(0, 150)}
                    {item.output_text.length > 150 && '...'}
                  </div>
                </div>
              ))}
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

      {/* 詳細モーダル */}
      {selectedItem && (
        <div className={styles.modalOverlay} onClick={closeDetail}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleWrapper}>
                <h3 className={styles.modalTitle}>
                  📋 {selectedItem.template_name}
                </h3>
                {selectedItem.client_name && (
                  <span className={styles.clientBadge}>
                    <User size={12} />
                    {selectedItem.client_name}
                  </span>
                )}
              </div>
              <button className={styles.modalCloseButton} onClick={closeDetail}>
                <X size={20} />
              </button>
            </div>

            {/* メタ情報 */}
            <div className={styles.modalMeta}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>元データ:</span>
                <span>{selectedItem.transcription_title}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>生成日時:</span>
                <span>{cmFormatDateTimeLocale(selectedItem.processed_at)}</span>
              </div>
              {selectedItem.updated_at && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>編集日時:</span>
                  <span>{cmFormatDateTimeLocale(selectedItem.updated_at)}</span>
                </div>
              )}
            </div>

            {/* 出力テキスト */}
            <div className={styles.modalBody}>
              {isEditing ? (
                <textarea
                  className={styles.editTextarea}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={15}
                />
              ) : (
                <pre className={styles.outputText}>{selectedItem.output_text}</pre>
              )}
            </div>

            {/* フッター */}
            <div className={styles.modalFooter}>
              <div className={styles.footerLeft}>
                {!isEditing && <CopyButton text={selectedItem.output_text} />}
              </div>
              <div className={styles.footerRight}>
                {isEditing ? (
                  <>
                    <button
                      className={styles.cancelButton}
                      onClick={() => setIsEditing(false)}
                    >
                      キャンセル
                    </button>
                    <button className={styles.saveButton} onClick={handleSave}>
                      <Save size={14} />
                      保存
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={styles.deleteButtonLarge}
                      onClick={() => handleDelete(selectedItem)}
                    >
                      <Trash2 size={14} />
                      削除
                    </button>
                    <button
                      className={styles.editButton}
                      onClick={startEditing}
                    >
                      <Edit size={14} />
                      編集
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};