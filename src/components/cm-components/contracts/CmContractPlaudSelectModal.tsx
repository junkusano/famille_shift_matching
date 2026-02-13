// =============================================================
// src/components/cm-components/contracts/CmContractPlaudSelectModal.tsx
// 契約紐付け用 録音選択モーダル
//
// 機能:
//   - 利用者(kaipoke_cs_id)の録音一覧を表示
//   - ラジオ選択で1件を選び、確定ボタンで紐付け
//   - 紐付け済みの場合は解除も可能
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Mic, Loader2, AlertCircle, Unlink } from 'lucide-react';
import { getPlaudRecordingsForContract } from '@/lib/cm/contracts/getPlaudRecordingsForContract';
import type { CmPlaudRecordingOption } from '@/lib/cm/contracts/getPlaudRecordingsForContract';
import {
  CM_PLAUD_STATUS_LABELS,
  type CmPlaudTranscriptionStatus,
} from '@/types/cm/plaud';
import styles from '@/styles/cm-styles/contracts/plaudSelect.module.css';

// =============================================================
// 型定義
// =============================================================

type CmContractPlaudSelectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (recordingId: number | null) => void;
  kaipokeCsId: string;
  currentRecordingId: number | null;
  submitting: boolean;
};

// =============================================================
// コンポーネント
// =============================================================

export function CmContractPlaudSelectModal({
  isOpen,
  onClose,
  onSelect,
  kaipokeCsId,
  currentRecordingId,
  submitting,
}: CmContractPlaudSelectModalProps) {
  const [recordings, setRecordings] = useState<CmPlaudRecordingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(currentRecordingId);

  // ---------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------
  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await getPlaudRecordingsForContract(kaipokeCsId);

      if (result.ok === false) {
        setError(result.error || '録音一覧の取得に失敗しました');
      } else {
        setRecordings(result.data);
      }
    } catch {
      setError('録音一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [kaipokeCsId]);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(currentRecordingId);
      fetchRecordings();
    }
  }, [isOpen, currentRecordingId, fetchRecordings]);

  // ---------------------------------------------------------
  // キーボードイベント
  // ---------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, submitting]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleConfirm = () => {
    if (selectedId !== currentRecordingId) {
      onSelect(selectedId);
    } else {
      onClose();
    }
  };

  const handleUnlink = () => {
    onSelect(null);
  };

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  if (!isOpen) return null;

  const hasChanged = selectedId !== currentRecordingId;
  const hasCurrentLink = currentRecordingId !== null;

  return (
    <div className={styles.overlay} onClick={submitting ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <h3 className={styles.title}>
            <Mic size={20} />
            録音を選択
          </h3>
          <button
            className={styles.closeButton}
            onClick={onClose}
            disabled={submitting}
          >
            <X size={20} />
          </button>
        </div>

        {/* コンテンツ */}
        <div className={styles.recordingList}>
          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={20} className="animate-spin" />
              読み込み中...
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <AlertCircle size={18} />
              {error}
            </div>
          ) : recordings.length === 0 ? (
            <div className={styles.emptyState}>
              <Mic size={32} className={styles.emptyIcon} />
              <p className={styles.emptyText}>
                この利用者に紐付いた録音がありません。
                <br />
                先にPlaud管理画面で録音を利用者に紐付けてください。
              </p>
            </div>
          ) : (
            recordings.map((recording) => {
              const isSelected = selectedId === recording.id;
              const statusInfo = CM_PLAUD_STATUS_LABELS[recording.status as CmPlaudTranscriptionStatus];

              return (
                <button
                  key={recording.id}
                  type="button"
                  className={`${styles.recordingItem} ${isSelected ? styles.recordingItemSelected : ''}`}
                  onClick={() => setSelectedId(recording.id)}
                  disabled={submitting}
                >
                  {/* ラジオインジケーター */}
                  <div
                    className={`${styles.radioIndicator} ${isSelected ? styles.radioIndicatorSelected : ''}`}
                  >
                    {isSelected && <div className={styles.radioInner} />}
                  </div>

                  {/* 録音情報 */}
                  <div className={styles.recordingInfo}>
                    <div className={styles.recordingTitle}>{recording.title}</div>
                    <div className={styles.recordingMeta}>
                      <span className={styles.recordingDate}>
                        {formatPlaudDate(recording.plaud_created_at)}
                      </span>
                      <span className={styles.recordingUuid}>
                        {recording.plaud_uuid.slice(0, 8)}...
                      </span>
                    </div>
                  </div>

                  {/* ステータスバッジ */}
                  {statusInfo && (
                    <span
                      className={styles.statusBadge}
                      style={{
                        backgroundColor: statusInfo.bg,
                        color: statusInfo.color,
                      }}
                    >
                      {statusInfo.label}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* フッター */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {hasCurrentLink && (
              <button
                type="button"
                className={styles.unlinkButton}
                onClick={handleUnlink}
                disabled={submitting}
              >
                <Unlink size={14} />
                紐付け解除
              </button>
            )}
          </div>
          <div className={styles.footerButtons}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={handleConfirm}
              disabled={submitting || !hasChanged || selectedId === null}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  保存中...
                </>
              ) : (
                '選択を確定'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// ヘルパー
// =============================================================

function formatPlaudDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}
