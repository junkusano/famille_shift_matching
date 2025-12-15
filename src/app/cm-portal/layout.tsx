// src/app/cm-portal/layout.tsx
'use client';

import React, { useState, type ReactNode } from 'react';
import { CmUserProvider } from '@/context/cm/CmUserContext';
import { CmSidebar } from '@/components/cm-components/layout/CmSidebar';
import { CmHeader } from '@/components/cm-components/layout/CmHeader';

interface CmPortalLayoutProps {
  children: ReactNode;
}

// サイドバーの幅（CSSと合わせる）
const SIDEBAR_WIDTH_EXPANDED = 256; // 16rem = 256px
const SIDEBAR_WIDTH_COLLAPSED = 80; // 5rem = 80px

export default function CmPortalLayout({ children }: CmPortalLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const sidebarWidth = sidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED;

  return (
    <CmUserProvider>
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
          <main className="p-6">
            {children}
          </main>
        </div>
      </div>
    </CmUserProvider>
  );
}