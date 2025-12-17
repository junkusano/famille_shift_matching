// =============================================================
// src/components/cm-components/clients/CmClientDisabledTab.tsx
// 利用者詳細 - 未実装タブ
// =============================================================

'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { CmCard } from '@/components/cm-components';

export function CmClientDisabledTab() {
  return (
    <CmCard>
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-slate-400" />
        </div>
        <p className="text-slate-600 font-medium">この機能は準備中です</p>
        <p className="text-sm text-slate-500 mt-2">
          カイポケスクレイピング実装後に利用可能になります
        </p>
      </div>
    </CmCard>
  );
}