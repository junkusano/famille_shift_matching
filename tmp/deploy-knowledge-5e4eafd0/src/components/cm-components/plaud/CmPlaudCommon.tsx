// =============================================================
// src/components/cm-components/plaud/CmPlaudCommon.tsx
// Plaud管理画面 共通コンポーネント
// =============================================================

'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  CmPlaudTranscriptionStatus,
  CM_PLAUD_STATUS_LABELS,
} from '@/types/cm/plaud';
import styles from '@/styles/cm-styles/plaud/common.module.css';

// =============================================================
// ローディングスピナー
// =============================================================

type LoadingSpinnerProps = {
  size?: number;
  message?: string;
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 24,
  message,
}) => (
  <div className={styles.loadingContainer}>
    <Loader2 size={size} className={styles.spinner} />
    {message && <span className={styles.loadingMessage}>{message}</span>}
  </div>
);

// =============================================================
// エラーメッセージ
// =============================================================

type ErrorMessageProps = {
  message: string;
  onRetry?: () => void;
};

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
}) => (
  <div className={styles.errorContainer}>
    <p className={styles.errorText}>{message}</p>
    {onRetry && (
      <button className={styles.retryButton} onClick={onRetry}>
        再試行
      </button>
    )}
  </div>
);

// =============================================================
// 空状態
// =============================================================

type EmptyStateProps = {
  message: string;
  icon?: React.ReactNode;
};

export const EmptyState: React.FC<EmptyStateProps> = ({ message, icon }) => (
  <div className={styles.emptyContainer}>
    {icon && <div className={styles.emptyIcon}>{icon}</div>}
    <p className={styles.emptyText}>{message}</p>
  </div>
);

// =============================================================
// ステータスバッジ
// =============================================================

type StatusBadgeProps = {
  status: CmPlaudTranscriptionStatus;
  showDescription?: boolean;
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showDescription = false,
}) => {
  const config = CM_PLAUD_STATUS_LABELS[status];

  return (
    <span
      className={styles.statusBadge}
      style={{ backgroundColor: config.bg, color: config.color }}
      title={config.description}
    >
      {config.label}
      {showDescription && (
        <span className={styles.statusDescription}>{config.description}</span>
      )}
    </span>
  );
};

// =============================================================
// ページネーション
// =============================================================

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasNext: boolean;
  hasPrev: boolean;
};

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPageChange,
  hasNext,
  hasPrev,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div className={styles.pagination}>
      <button
        className={styles.paginationButton}
        onClick={() => onPageChange(page - 1)}
        disabled={!hasPrev}
      >
        ← 前へ
      </button>
      <span className={styles.paginationInfo}>
        {page} / {totalPages}
      </span>
      <button
        className={styles.paginationButton}
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNext}
      >
        次へ →
      </button>
    </div>
  );
};

// =============================================================
// 確認ダイアログ
// =============================================================

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = '確認',
  cancelLabel = 'キャンセル',
  onConfirm,
  onCancel,
  isDestructive = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.dialogOverlay} onClick={onCancel}>
      <div className={styles.dialogContent} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.dialogTitle}>{title}</h3>
        <p className={styles.dialogMessage}>{message}</p>
        <div className={styles.dialogActions}>
          <button className={styles.dialogCancelButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`${styles.dialogConfirmButton} ${
              isDestructive ? styles.dialogConfirmButtonDestructive : ''
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================
// テキストエリア（自動リサイズ）
// =============================================================

type AutoResizeTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
  className?: string;
};

export const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({
  value,
  onChange,
  placeholder,
  minRows = 3,
  maxRows = 20,
  disabled = false,
  className,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);

    // 自動リサイズ
    e.target.style.height = 'auto';
    const lineHeight = 20;
    const minHeight = lineHeight * minRows;
    const maxHeight = lineHeight * maxRows;
    const newHeight = Math.min(Math.max(e.target.scrollHeight, minHeight), maxHeight);
    e.target.style.height = `${newHeight}px`;
  };

  return (
    <textarea
      className={`${styles.autoResizeTextarea} ${className || ''}`}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      rows={minRows}
    />
  );
};

// =============================================================
// コピーボタン
// =============================================================

type CopyButtonProps = {
  text: string;
  onCopied?: () => void;
};

export const CopyButton: React.FC<CopyButtonProps> = ({ text, onCopied }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  };

  return (
    <button
      className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ''}`}
      onClick={handleCopy}
      title="コピー"
    >
      {copied ? '✓ コピー済み' : '📋 コピー'}
    </button>
  );
};