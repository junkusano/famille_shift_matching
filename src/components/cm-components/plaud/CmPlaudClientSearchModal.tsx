// =============================================================
// src/components/cm-components/plaud/CmPlaudClientSearchModal.tsx
// 利用者検索モーダル
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, User } from 'lucide-react';
import { usePlaudClients } from '@/hooks/cm/plaud/usePlaudClients';
import { CmClient } from '@/types/cm/plaud';
import styles from '@/styles/cm-styles/plaud/clientSearch.module.css';

// =============================================================
// 型定義
// =============================================================

type CmPlaudClientSearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (client: CmClient) => void;
  currentKaipokeCsId?: string | null;
};

// =============================================================
// コンポーネント
// =============================================================

export const CmPlaudClientSearchModal: React.FC<CmPlaudClientSearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentKaipokeCsId,
}) => {
  const {
    clients,
    searchQuery,
    setSearchQuery,
    search,
    isLoading,
    error,
    clear,
  } = usePlaudClients();

  const [inputValue, setInputValue] = useState('');

  // モーダルが開いたときにリセット
  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      clear();
    }
  }, [isOpen, clear]);

  // 検索実行（デバウンス）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue.trim()) {
        search(inputValue.trim());
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, search]);

  // 選択処理
  const handleSelect = useCallback((client: CmClient) => {
    onSelect(client);
    onClose();
  }, [onSelect, onClose]);

  // キーボードイベント
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <h3 className={styles.title}>
            <User size={20} />
            利用者を検索
          </h3>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 検索入力 */}
        <div className={styles.searchContainer}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="名前・カナ・カイポケIDで検索..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
          {inputValue && (
            <button
              className={styles.clearButton}
              onClick={() => {
                setInputValue('');
                clear();
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 検索結果 */}
        <div className={styles.results}>
          {isLoading ? (
            <div className={styles.loadingState}>検索中...</div>
          ) : error ? (
            <div className={styles.errorState}>{error}</div>
          ) : clients.length === 0 ? (
            <div className={styles.emptyState}>
              {inputValue
                ? '該当する利用者が見つかりません'
                : '名前・カナ・カイポケIDで検索してください'}
            </div>
          ) : (
            <ul className={styles.clientList}>
              {clients.map((client) => (
                <li
                  key={client.id}
                  className={`${styles.clientItem} ${
                    client.kaipoke_cs_id === currentKaipokeCsId
                      ? styles.clientItemCurrent
                      : ''
                  }`}
                  onClick={() => handleSelect(client)}
                >
                  <div className={styles.clientInfo}>
                    <span className={styles.clientName}>{client.name}</span>
                    {client.kana && (
                      <span className={styles.clientKana}>{client.kana}</span>
                    )}
                  </div>
                  <div className={styles.clientMeta}>
                    {client.kaipoke_cs_id && (
                      <span className={styles.clientId}>
                        ID: {client.kaipoke_cs_id}
                      </span>
                    )}
                    {client.birth_date && (
                      <span className={styles.clientBirth}>
                        {client.birth_date}
                      </span>
                    )}
                  </div>
                  {client.kaipoke_cs_id === currentKaipokeCsId && (
                    <span className={styles.currentBadge}>現在選択中</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* フッター */}
        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};