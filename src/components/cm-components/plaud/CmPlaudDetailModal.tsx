// =============================================================
// src/components/cm-components/plaud/CmPlaudDetailModal.tsx
// 文字起こし詳細モーダル
// =============================================================

'use client';

import React, { useState } from 'react';
import { X, User, Calendar, Clock, FileText, Wand2 } from 'lucide-react';
import { usePlaudTranscriptions } from '@/hooks/cm/plaud/usePlaudTranscriptions';
import { CmPlaudTranscription, CmClient } from '@/types/cm/plaud';
import { StatusBadge, CopyButton } from './CmPlaudCommon';
import { CmPlaudClientSearchModal } from './CmPlaudClientSearchModal';
import styles from '@/styles/cm-styles/plaud/modal.module.css';

// =============================================================
// 型定義
// =============================================================

type CmPlaudDetailModalProps = {
  isOpen: boolean;
  item: CmPlaudTranscription | null;
  onClose: () => void;
  onOpenProcess: (item: CmPlaudTranscription) => void;
};

// =============================================================
// コンポーネント
// =============================================================

export const CmPlaudDetailModal: React.FC<CmPlaudDetailModalProps> = ({
  isOpen,
  item,
  onClose,
  onOpenProcess,
}) => {
  const { updateClient } = usePlaudTranscriptions();

  // 利用者検索モーダル
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<CmPlaudTranscription | null>(null);

  // 利用者選択処理
  const handleClientSelect = async (client: CmClient) => {
    if (currentItem && client.kaipoke_cs_id) {
      const success = await updateClient(currentItem.id, client.kaipoke_cs_id);
      if (success) {
        // ローカルのitemを更新（親コンポーネントで再取得されるため不要な場合もある）
      }
    }
    setIsClientSearchOpen(false);
  };

  // 利用者紐付けボタン
  const handleOpenClientSearch = () => {
    setCurrentItem(item);
    setIsClientSearchOpen(true);
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
      second: '2-digit',
    });
  };

  if (!isOpen || !item) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          {/* ヘッダー */}
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <FileText size={20} />
              <h2 className={styles.title}>{item.title}</h2>
              <StatusBadge status={item.status} />
            </div>
            <button className={styles.closeButton} onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          {/* メタ情報 */}
          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <Calendar size={16} />
              <span>録音日時: {formatDate(item.plaud_created_at)}</span>
            </div>
            <div className={styles.metaItem}>
              <Clock size={16} />
              <span>登録日時: {formatDate(item.created_at)}</span>
            </div>
            {item.registered_by && (
              <div className={styles.metaItem}>
                <User size={16} />
                <span>登録者: {item.registered_by}</span>
              </div>
            )}
          </div>

          {/* 利用者紐付け */}
          <div className={styles.clientSection}>
            <div className={styles.clientLabel}>紐付け利用者</div>
            {item.client_name ? (
              <div className={styles.clientInfo}>
                <User size={16} />
                <span className={styles.clientName}>{item.client_name}</span>
                <span className={styles.clientId}>({item.kaipoke_cs_id})</span>
                <button
                  className={styles.clientChangeButton}
                  onClick={handleOpenClientSearch}
                >
                  変更
                </button>
              </div>
            ) : (
              <button
                className={styles.clientLinkButton}
                onClick={handleOpenClientSearch}
              >
                <User size={16} />
                利用者を紐付ける
              </button>
            )}
          </div>

          {/* 文字起こし内容 */}
          <div className={styles.contentSection}>
            <div className={styles.contentHeader}>
              <span className={styles.contentLabel}>文字起こし内容</span>
              {item.transcript && <CopyButton text={item.transcript} />}
            </div>
            <div className={styles.contentBody}>
              {item.status === 'completed' && item.transcript ? (
                <pre className={styles.transcriptText}>{item.transcript}</pre>
              ) : item.status === 'pending' ? (
                <div className={styles.statusMessage}>
                  ⏳ 承認待ちです。承認後、次回のChrome拡張実行時に文字起こしが取得されます。
                </div>
              ) : item.status === 'approved' ? (
                <div className={styles.statusMessage}>
                  🔄 承認済みです。次回のChrome拡張実行時に文字起こしが取得されます。
                </div>
              ) : item.status === 'failed' ? (
                <div className={styles.statusMessage}>
                  ❌ 文字起こしの取得に失敗しました。リトライするか、Plaud側の状態を確認してください。
                  <br />
                  <small>リトライ回数: {item.retry_count}/3</small>
                </div>
              ) : (
                <div className={styles.statusMessage}>
                  文字起こしデータがありません
                </div>
              )}
            </div>
          </div>

          {/* フッター */}
          <div className={styles.footer}>
            <button className={styles.cancelButton} onClick={onClose}>
              閉じる
            </button>
            {item.status === 'completed' && item.transcript && (
              <button
                className={styles.primaryButton}
                onClick={() => {
                  onClose();
                  onOpenProcess(item);
                }}
              >
                <Wand2 size={16} />
                二次利用する
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 利用者検索モーダル */}
      <CmPlaudClientSearchModal
        isOpen={isClientSearchOpen}
        onClose={() => setIsClientSearchOpen(false)}
        onSelect={handleClientSelect}
        currentKaipokeCsId={item?.kaipoke_cs_id}
      />
    </>
  );
};