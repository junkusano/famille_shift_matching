// =============================================================
// src/components/cm-components/clients/CmClientDocumentsTab.tsx
// 利用者詳細 - 書類管理タブ
// =============================================================

'use client';

import React from 'react';
import { FileText, FolderOpen, ExternalLink } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import type { CmDocument } from '@/types/cm/clientDetail';

type Props = {
  documents: CmDocument[] | null;
};

export function CmClientDocumentsTab({ documents }: Props) {
  const docs = documents ?? [];

  if (docs.length === 0) {
    return (
      <CmCard>
        <div className="text-center py-8">
          <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">書類がありません</p>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            書類を追加
          </button>
        </div>
      </CmCard>
    );
  }

  return (
    <CmCard title="書類一覧">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start gap-3">
              <FileText className="w-8 h-8 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {doc.label || '書類'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {doc.type || '種別未設定'}
                </p>
                {doc.acquired_at && (
                  <p className="text-xs text-slate-400 mt-1">
                    取得日: {doc.acquired_at}
                  </p>
                )}
              </div>
            </div>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-1 w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm text-slate-700 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                表示
              </a>
            )}
          </div>
        ))}
      </div>
    </CmCard>
  );
}