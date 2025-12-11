// src/components/cm-components/ui/CmCard.tsx
import React from 'react';
import styles from '@/styles/cm-styles/components/card.module.css';

type CmCardProps = {
  title?: string;
  headerRight?: React.ReactNode;
  footer?: React.ReactNode;
  noPadding?: boolean;
  children: React.ReactNode;
  className?: string;
};

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
      {title && (
        <div className={styles.cmCardHeader}>
          <h3 className={styles.cmCardTitle}>{title}</h3>
          {headerRight && (
            <div className={styles.cmCardHeaderRight}>{headerRight}</div>
          )}
        </div>
      )}
      <div
        className={noPadding ? styles.cmCardBodyNoPadding : styles.cmCardBody}
      >
        {children}
      </div>
      {footer && <div className={styles.cmCardFooter}>{footer}</div>}
    </div>
  );
};

export default CmCard;
