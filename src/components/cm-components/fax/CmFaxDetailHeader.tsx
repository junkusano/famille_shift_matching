// =============================================================
// src/components/cm-components/fax/CmFaxDetailHeader.tsx
// FAX詳細 - ヘッダー（2段構成）
//
// 【v3.1対応】
// - 上段: 戻るボタン / FAX番号 / 受信日時 / 進捗バー
// - 下段: 送信元事業所（複数対応、プライマリ色分け）
// =============================================================

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Building2, Plus } from 'lucide-react';
import type {
  CmFaxReceived,
  CmFaxReceivedOffice,
  CmProcessingStatus,
} from '@/types/cm/faxDetail';

type Props = {
  fax: CmFaxReceived;
  offices: CmFaxReceivedOffice[];
  processingStatus: CmProcessingStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onAddOffice: () => void;
};

export function CmFaxDetailHeader({
  fax,
  offices,
  processingStatus,
  onAddOffice,
  // loading, onRefresh は現在のデザインでは使用しないが、後方互換性のため残す
}: Props) {
  const router = useRouter();

  const handleBack = () => {
    router.push('/cm-portal/fax');
  };

  // 日時フォーマット: 2026-01-13 10:30 形式
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  // 進捗計算
  const totalPages = processingStatus?.total_pages ?? fax.page_count ?? 0;
  const assignedPages = processingStatus?.assigned_pages ?? 0;
  const completionRate = totalPages > 0 ? (assignedPages / totalPages) * 100 : 0;

  return (
    <header className="bg-white border-b flex flex-col">
      {/* 上段: FAX情報 + 進捗バー */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            戻る
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">FAX</span>
          <span className="font-mono text-sm font-medium text-gray-900">
            {fax.fax_number || '番号不明'}
          </span>
          <span className="text-xs text-gray-400">
            {fax.received_at ? formatDateTime(fax.received_at) : ''}
          </span>
        </div>

        {/* 進捗バー */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">
            <span className="font-bold text-teal-600">{assignedPages}</span>
            <span className="text-gray-400"> / {totalPages} 完了</span>
          </span>
          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* 下段: 送信元事業所 */}
      <div className="h-10 flex items-center px-4 bg-gray-50">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600" />
          <span className="text-xs text-gray-500">送信元:</span>
          <div className="flex items-center gap-2 flex-wrap">
            {offices.length === 0 ? (
              <span className="text-xs text-gray-400">未特定</span>
            ) : (
              offices.map((office) => (
                <span
                  key={office.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                    office.is_primary
                      ? 'bg-teal-100 text-teal-800 border border-teal-200'
                      : 'bg-white text-gray-700 border border-gray-200'
                  }`}
                >
                  {office.is_primary && <span className="text-teal-500">●</span>}
                  <span className="font-medium">{office.office_name}</span>
                  {office.is_primary && (
                    <span className="text-teal-600">（プライマリ）</span>
                  )}
                  {office.assigned_by && (
                    <span className="text-gray-400">（手動）</span>
                  )}
                </span>
              ))
            )}
            <button
              onClick={onAddOffice}
              className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
              title="事業所を追加"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}