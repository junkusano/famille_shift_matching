// =============================================================
// src/components/cm-components/ui/CmCard.tsx
// CM共通カードコンポーネント
//
// ヘッダー（タイトル + 右端アクション）、ボディ、フッターの
// 3セクション構成の汎用カード。CM管理画面の各ページで使用。
// =============================================================

import React from 'react';
import styles from '@/styles/cm-styles/components/card.module.css';

// =============================================================
// 型定義
// =============================================================

type CmCardProps = {
  /** カードタイトル（省略時はヘッダー非表示） */
  title?: string;
  /** ヘッダー右端に配置する要素（ボタン等） */
  headerRight?: React.ReactNode;
  /** フッター要素（省略時はフッター非表示） */
  footer?: React.ReactNode;
  /** ボディの余白を除去する */
  noPadding?: boolean;
  /** カード内コンテンツ */
  children: React.ReactNode;
  /** 追加CSSクラス */
  className?: string;
};

// =============================================================
// コンポーネント
// =============================================================

export const CmCard: React.FC<CmCardProps> = ({
  title,
  headerRight,
  footer,
  noPadding = false,
  children,
  className = '',
}) => {
  return (
    <div className={`${styles.cmCard} ${className}`}>
      {/* ヘッダー（タイトル指定時のみ表示） */}
      {title && (
        <div className={styles.cmCardHeader}>
          <h3 className={styles.cmCardTitle}>{title}</h3>
          {headerRight && (
            <div className={styles.cmCardHeaderRight}>{headerRight}</div>
          )}
        </div>
      )}

      {/* ボディ */}
      <div
        className={noPadding ? styles.cmCardBodyNoPadding : styles.cmCardBody}
      >
        {children}
      </div>

      {/* フッター（指定時のみ表示） */}
      {footer && <div className={styles.cmCardFooter}>{footer}</div>}
    </div>
  );
};