// src/components/cm-components/layout/CmUserSection.tsx
'use client';

import React from 'react';
import Image from 'next/image';
import { useCmUser } from '@/hooks/cm/users/useCmUser';
import styles from '@/styles/cm-styles/components/sidebar.module.css';

interface CmUserSectionProps {
  isExpanded: boolean;
}

/**
 * サイドバー内のユーザー情報表示セクション
 */
export function CmUserSection({ isExpanded }: CmUserSectionProps) {
  const { user, loading } = useCmUser();

  // ローディング中
  if (loading) {
    return (
      <div className={styles.cmUserSection}>
        <div className={`${styles.cmUserInfo} ${!isExpanded ? styles.cmUserInfoCollapsed : ''}`}>
          <div className={styles.cmAvatar}>
            <div className={`${styles.cmAvatarImage} animate-pulse bg-gray-600`} />
          </div>
          {isExpanded && (
            <div className="space-y-2">
              <div className="h-4 w-20 bg-gray-600 rounded animate-pulse" />
              <div className="h-3 w-12 bg-gray-700 rounded animate-pulse" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ユーザー未ログイン
  if (!user) {
    return (
      <div className={styles.cmUserSection}>
        <div className={`${styles.cmUserInfo} ${!isExpanded ? styles.cmUserInfoCollapsed : ''}`}>
          <div className={styles.cmAvatar}>
            <div className={`${styles.cmAvatarImage} bg-gray-500 flex items-center justify-center`}>
              <span className="text-white text-xs">?</span>
            </div>
          </div>
          {isExpanded && (
            <div>
              <div className={styles.cmUserName}>未ログイン</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 通常表示
  return (
    <div className={styles.cmUserSection}>
      <div className={`${styles.cmUserInfo} ${!isExpanded ? styles.cmUserInfoCollapsed : ''}`}>
        {/* アバター */}
        <div className={styles.cmAvatar}>
          {user.photoUrl ? (
            <Image
              src={user.photoUrl}
              alt={`${user.displayName}のアバター`}
              width={40}
              height={40}
              className={styles.cmAvatarImage}
            />
          ) : (
            <div className={`${styles.cmAvatarImage} bg-blue-600 flex items-center justify-center`}>
              <span className="text-white text-sm font-medium">
                {user.lastNameKanji?.charAt(0) || user.displayName?.charAt(0) || '?'}
              </span>
            </div>
          )}
          <span className={styles.cmAvatarStatus} />
        </div>

        {/* ユーザー名・権限（DBの値をそのまま表示） */}
        {isExpanded && (
          <div>
            <div className={styles.cmUserName}>{user.displayName}</div>
            <div className={styles.cmUserRole}>
              {user.role ? `ユーザー権限: ${user.role}` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CmUserSection;