// src/app/cm-portal/layout.tsx
'use client';

import React, { useState, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CmUserProvider, useCmUserContext } from '@/context/cm/CmUserContext';
import { CmSidebar } from '@/components/cm-components/layout/CmSidebar';
import { CmHeader } from '@/components/cm-components/layout/CmHeader';

interface CmPortalLayoutProps {
  children: ReactNode;
}

// サイドバーの幅（CSSと合わせる）
const SIDEBAR_WIDTH_EXPANDED = 256; // 16rem = 256px
const SIDEBAR_WIDTH_COLLAPSED = 80; // 5rem = 80px

/**
 * 認証ガードコンポーネント
 * - 未ログイン → /login へリダイレクト
 * - service_type が kyotaku/both 以外 → /unauthorized へリダイレクト
 */
function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, error } = useCmUserContext();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // ローディング中は何もしない
    if (loading) return;

    // エラーまたはユーザーがいない場合 → ログインページへ
    if (error || !user) {
      router.replace('/login');
      return;
    }

    // service_type チェック（kyotaku または both のみ許可）
    const serviceType = user.serviceType;
    if (!serviceType || !['kyotaku', 'both'].includes(serviceType)) {
      // houmon_kaigo の場合は /portal へ
      if (serviceType === 'houmon_kaigo') {
        router.replace('/portal');
      } else {
        router.replace('/unauthorized');
      }
      return;
    }

    // 認証OK
    setIsAuthorized(true);
  }, [user, loading, error, router]);

  // ローディング中
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 rounded-full border-t-transparent mx-auto" />
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  // 未認証（リダイレクト中）
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 rounded-full border-t-transparent mx-auto" />
          <p className="mt-4 text-gray-600">リダイレクト中...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * cm-portal レイアウト本体
 */
function CmPortalLayoutContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarWidth = sidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED;

  // FAX詳細ページかどうか判定（/cm-portal/fax/数字）
  const isFaxDetailPage = pathname ? /^\/cm-portal\/fax\/\d+$/.test(pathname) : false;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-100">
        {/* サイドバー（固定位置） */}
        <CmSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* メインエリア（サイドバー幅分のマージン） */}
        <div
          className="transition-all duration-200"
          style={{ marginLeft: sidebarWidth }}
        >
          {/* ヘッダー */}
          <CmHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

          {/* コンテンツ */}
          {/* FAX詳細ページの時はパディングなし（全画面表示のため） */}
          <main className={isFaxDetailPage ? '' : 'p-6'}>
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}

/**
 * メインエクスポート
 */
export default function CmPortalLayout({ children }: CmPortalLayoutProps) {
  return (
    <CmUserProvider>
      <CmPortalLayoutContent>{children}</CmPortalLayoutContent>
    </CmUserProvider>
  );
}