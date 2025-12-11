// src/components/cm-components/layout/CmSidebar.tsx
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Users,
  ClipboardList,
  CalendarDays,
  Receipt,
  Bell,
  Workflow,
  Database,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HeartHandshake,
} from 'lucide-react';
import styles from '@/styles/cm-styles/components/sidebar.module.css';
import { CmUserSection } from './CmUserSection';
import { useCmHasRole } from '@/hooks/cm/useCmUser';

type MenuItem = {
  id: string;
  label: string;
  path: string;
  badge?: string;
};

type MenuGroup = {
  id: string;
  label: string;
  icon: React.ElementType;
  items: MenuItem[];
  roles?: string[];
};

const menuStructure: MenuGroup[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    items: [
      { id: 'myfamille-home', label: 'MyFamilleHome', path: '/' },
      { id: 'portal-home', label: '訪問介護ポータルHome', path: '/portal' },
      { id: 'kyotaku-home', label: '居宅介護支援ポータルHome', path: '/cm-portal' },
    ],
  },
  {
    id: 'clients',
    label: '利用者管理',
    icon: Users,
    items: [
      { id: 'client-list', label: '利用者一覧', path: '/cm-portal/clients' },
      { id: 'insurance', label: '被保険者証', path: '/cm-portal/clients/insurance' },
      { id: 'subsidy', label: '公費・減額', path: '/cm-portal/clients/subsidy' },
    ],
  },
  {
    id: 'care-plan',
    label: 'ケアプラン',
    icon: ClipboardList,
    items: [
      { id: 'plan', label: '計画書作成', path: '/cm-portal/care-plan' },
      { id: 'weekly', label: '週間計画', path: '/cm-portal/care-plan/weekly' },
      { id: 'monitoring', label: 'モニタリング', path: '/cm-portal/care-plan/monitoring' },
      { id: 'conference', label: '担当者会議', path: '/cm-portal/care-plan/conference' },
      { id: 'progress', label: '支援経過', path: '/cm-portal/care-plan/progress' },
    ],
  },
  {
    id: 'schedule',
    label: '予定・実績',
    icon: CalendarDays,
    items: [
      { id: 'calendar', label: 'スケジュール', path: '/cm-portal/schedule' },
      { id: 'tickets', label: '利用票・提供票', path: '/cm-portal/schedule/tickets' },
      { id: 'sync', label: '連携状況', path: '/cm-portal/schedule/sync' },
    ],
  },
  {
    id: 'billing',
    label: '請求管理',
    icon: Receipt,
    items: [
      { id: 'benefit', label: '給付費設定', path: '/cm-portal/billing/benefit' },
      { id: 'closing', label: '月締め処理', path: '/cm-portal/billing/closing' },
      { id: 'transmission', label: '伝送・出力', path: '/cm-portal/billing/transmission' },
    ],
  },
  {
    id: 'notifications',
    label: '通知',
    icon: Bell,
    items: [
      { id: 'alerts', label: '期限アラート', path: '/cm-portal/notifications/alerts' },
      { id: 'reminders', label: '業務リマインド', path: '/cm-portal/notifications/reminders' },
      { id: 'history', label: '通知履歴', path: '/cm-portal/notifications/history' },
    ],
  },
  {
    id: 'rpa',
    label: 'RPA',
    icon: Workflow,
    roles: ['admin', 'manager'],
    items: [
      { id: 'rpa-status', label: '実行状況', path: '/cm-portal/rpa/status' },
      { id: 'rpa-queue', label: '実行キュー', path: '/cm-portal/rpa/queue' },
      { id: 'rpa-history', label: '実行履歴', path: '/cm-portal/rpa/history' },
    ],
  },
  {
    id: 'master',
    label: 'マスタ',
    icon: Database,
    roles: ['admin', 'manager'],
    items: [
      { id: 'offices', label: '事業所', path: '/cm-portal/master/offices' },
      { id: 'care-managers', label: 'ケアマネ', path: '/cm-portal/master/care-managers' },
      { id: 'services', label: '独自サービス', path: '/cm-portal/master/services' },
    ],
  },
  {
    id: 'settings',
    label: '設定',
    icon: Settings,
    items: [
      { id: 'form-settings', label: '帳票設定', path: '/cm-portal/settings/forms' },
      { id: 'notification-settings', label: '通知設定', path: '/cm-portal/settings/notifications' },
      { id: 'account', label: 'アカウント', path: '/cm-portal/settings/account' },
    ],
  },
];

type CmSidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
};

export function CmSidebar({ isOpen, onToggle }: CmSidebarProps) {
  const pathname = usePathname();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['home', 'clients']);
  
  const isManagerOrAdmin = useCmHasRole(['admin', 'manager']);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuId)
        ? prev.filter((id) => id !== menuId)
        : [...prev, menuId]
    );
  };

  const isActive = (path: string) => pathname === path;

  const filteredMenuStructure = menuStructure.filter((menu) => {
    if (!menu.roles) return true;
    if (menu.roles.includes('admin') && isManagerOrAdmin) return true;
    if (menu.roles.includes('manager') && isManagerOrAdmin) return true;
    return false;
  });

  return (
    <aside
      className={`${styles.cmSidebar} ${
        isOpen ? styles.cmSidebarExpanded : styles.cmSidebarCollapsed
      }`}
    >
      <div className={styles.cmSidebarLogo}>
        <div className={styles.cmLogoIcon}>
          <HeartHandshake className="w-5 h-5 text-white" />
        </div>
        {isOpen && (
          <div className={styles.cmLogoText}>
            <div className={styles.cmLogoTitle}>MyFamille</div>
            <div className={styles.cmLogoSubtitle}>居宅介護支援ポータル</div>
          </div>
        )}
      </div>

      <CmUserSection isExpanded={isOpen} />

      <nav className={styles.cmNav}>
        {filteredMenuStructure.map((menu) => (
          <div key={menu.id} className={styles.cmMenuGroup}>
            <button
              onClick={() => toggleMenu(menu.id)}
              className={`${styles.cmMenuItem} ${
                expandedMenus.includes(menu.id) ? styles.cmMenuItemActive : ''
              }`}
            >
              <menu.icon className={styles.cmMenuIcon} />
              {isOpen && (
                <>
                  <span className={styles.cmMenuLabel}>{menu.label}</span>
                  <ChevronDown
                    className={`${styles.cmMenuArrow} ${
                      expandedMenus.includes(menu.id) ? styles.cmMenuArrowOpen : ''
                    }`}
                  />
                </>
              )}
            </button>

            {isOpen && expandedMenus.includes(menu.id) && (
              <div className={styles.cmSubMenu}>
                {menu.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.path}
                    className={`${styles.cmSubMenuItem} ${
                      isActive(item.path) ? styles.cmSubMenuItemActive : ''
                    }`}
                  >
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge && (
                      <span className={styles.cmBadge}>{item.badge}</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className={styles.cmSidebarFooter}>
        <button onClick={onToggle} className={styles.cmToggleButton}>
          {isOpen ? (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span>メニューを閉じる</span>
            </>
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>
      </div>
    </aside>
  );
}

export default CmSidebar;