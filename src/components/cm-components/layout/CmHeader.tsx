// src/components/cm-components/layout/CmHeader.tsx
'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, Bell, Search, ChevronRight } from 'lucide-react';
import styles from '@/styles/cm-styles/components/header.module.css';

interface CmHeaderProps {
  onMenuToggle?: () => void;
}

type CmBreadcrumb = {
  label: string;
  path: string;
  isLink?: boolean;
};

// パスからパンくずリストを生成
const cmGetBreadcrumbs = (pathname: string): CmBreadcrumb[] => {
  const pathMap: Record<string, string> = {
    '/cm-portal': 'ホーム',
    '/cm-portal/fax': 'FAX受信一覧',
    '/cm-portal/plaud': '文字起こし管理', // ★ 追加
    '/cm-portal/clients': '利用者一覧',
    '/cm-portal/clients/insurance': '被保険者証',
    '/cm-portal/clients/subsidy': '公費・減額',
    '/cm-portal/other-offices': '他社事業所一覧',
    '/cm-portal/local-fax-phonebook': 'ローカルFAX電話帳',
    '/cm-portal/care-plan': '計画書作成',
    '/cm-portal/care-plan/weekly': '週間計画',
    '/cm-portal/care-plan/monitoring': 'モニタリング',
    '/cm-portal/care-plan/conference': '担当者会議',
    '/cm-portal/care-plan/progress': '支援経過',
    '/cm-portal/schedule': 'スケジュール',
    '/cm-portal/schedule/tickets': '利用票・提供票',
    '/cm-portal/schedule/sync': '連携状況',
    '/cm-portal/billing/benefit': '給付費設定',
    '/cm-portal/billing/closing': '月締め処理',
    '/cm-portal/billing/transmission': '伝送・出力',
    '/cm-portal/notifications/alerts': '期限アラート',
    '/cm-portal/notifications/reminders': '業務リマインド',
    '/cm-portal/notifications/history': '通知履歴',
    '/cm-portal/rpa-jobs': 'RPAジョブ登録',
    '/cm-portal/rpa-logs': 'RPAログ',
    '/cm-portal/rpa/status': '実行状況',
    '/cm-portal/rpa/queue': '実行キュー',
    '/cm-portal/rpa/history': '実行履歴',
    '/cm-portal/master/offices': '事業所',
    '/cm-portal/master/care-managers': 'ケアマネ',
    '/cm-portal/master/services': '独自サービス',
    '/cm-portal/settings/forms': '帳票設定',
    '/cm-portal/settings/notifications': '通知設定',
    '/cm-portal/settings/account': 'アカウント',
    '/cm-portal/audit/logs': '操作ログ',
    '/cm-portal/admin/alert-batch': 'アラートバッチ',
    '/cm-portal/service-credentials': 'サービス認証情報',
  };

  const breadcrumbs: CmBreadcrumb[] = [
    { label: '居宅介護支援ポータル', path: '/cm-portal', isLink: true },
  ];

  // 完全一致チェック
  if (pathname !== '/cm-portal' && pathMap[pathname]) {
    breadcrumbs.push({ label: pathMap[pathname], path: pathname, isLink: false });
    return breadcrumbs;
  }

  // 動的ルート対応（/cm-portal/clients/[id] など）
  // 利用者詳細ページ
  const clientDetailMatch = pathname.match(/^\/cm-portal\/clients\/([^/]+)$/);
  if (clientDetailMatch) {
    breadcrumbs.push({ label: '利用者情報一覧', path: '/cm-portal/clients', isLink: true });
    breadcrumbs.push({ label: '利用者詳細', path: pathname, isLink: false });
    return breadcrumbs;
  }

  // FAX詳細ページ
  const faxDetailMatch = pathname.match(/^\/cm-portal\/fax\/([^/]+)$/);
  if (faxDetailMatch) {
    breadcrumbs.push({ label: 'FAX受信一覧', path: '/cm-portal/fax', isLink: true });
    breadcrumbs.push({ label: 'FAX詳細', path: pathname, isLink: false });
    return breadcrumbs;
  }

  // RPAジョブ詳細ページ
  const rpaJobDetailMatch = pathname.match(/^\/cm-portal\/rpa-jobs\/([^/]+)$/);
  if (rpaJobDetailMatch) {
    breadcrumbs.push({ label: 'RPAジョブ登録', path: '/cm-portal/rpa-jobs', isLink: true });
    breadcrumbs.push({ label: 'ジョブ詳細', path: pathname, isLink: false });
    return breadcrumbs;
  }

  // RPAログ詳細ページ
  const rpaLogDetailMatch = pathname.match(/^\/cm-portal\/rpa-logs\/([^/]+)$/);
  if (rpaLogDetailMatch) {
    breadcrumbs.push({ label: 'RPAログ', path: '/cm-portal/rpa-logs', isLink: true });
    breadcrumbs.push({ label: 'ログ詳細', path: pathname, isLink: false });
    return breadcrumbs;
  }

  // その他の動的ルートパターンをここに追加可能
  // 例: /cm-portal/care-plan/[id] など

  return breadcrumbs;
};

export function CmHeader({ onMenuToggle }: CmHeaderProps) {
  const pathname = usePathname();
  const breadcrumbs = cmGetBreadcrumbs(pathname || '/cm-portal');

  return (
    <header className={styles.cmHeader}>
      <div className={styles.cmHeaderLeft}>
        {/* モバイル用メニューボタン */}
        <button
          className={styles.cmMenuButton}
          onClick={onMenuToggle}
          aria-label="メニューを開く"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* パンくずリスト */}
        <nav className={styles.cmBreadcrumb} aria-label="パンくずリスト">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.path}>
              {index > 0 && (
                <ChevronRight className="w-4 h-4 text-gray-400 mx-1" />
              )}
              {crumb.isLink ? (
                <Link
                  href={crumb.path}
                  className={styles.cmBreadcrumbLink}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={styles.cmBreadcrumbCurrent}>
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className={styles.cmHeaderRight}>
        {/* 検索 */}
        <div className={styles.cmSearchBox}>
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="検索..."
            className={styles.cmSearchInput}
          />
        </div>

        {/* 通知 */}
        <button className={styles.cmNotificationButton} aria-label="通知">
          <Bell className="w-5 h-5" />
          <span className={styles.cmNotificationBadge}>3</span>
        </button>
      </div>
    </header>
  );
}

export default CmHeader;