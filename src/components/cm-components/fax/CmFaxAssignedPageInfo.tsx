// =============================================================
// src/components/cm-components/fax/CmFaxAssignedPageInfo.tsx
// FAX詳細 - 割り当て済みページ表示
// =============================================================

'use client';

import React from 'react';
import { FileText, User, FileType, Trash2, Megaphone, Mail, Check } from 'lucide-react';
import type { CmFaxDocument } from '@/types/cm/faxDetail';

type Props = {
  document: CmFaxDocument;
  currentPageNumber: number;
  onViewDocuments: () => void;
  onRemoveFromDocument?: () => void;
  disabled?: boolean;
};

export function CmFaxAssignedPageInfo({
  document,
  currentPageNumber,
  onViewDocuments,
  onRemoveFromDocument,
  disabled = false,
}: Props) {
  const clientNames = document.client_names ?? [];
  const pageNumbers = document.page_numbers ?? [];
  const primaryClient = clientNames[0];

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        document.is_advertisement
          ? 'bg-orange-50 border-orange-200'
          : 'bg-green-50 border-green-200'
      }`}
    >
      <div
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
          document.is_advertisement
            ? 'bg-orange-100 text-orange-800'
            : 'bg-green-100 text-green-800'
        }`}
      >
        <Check className="w-4 h-4" />
        <span>このページは割り当て済みです</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {document.is_advertisement ? (
            <Megaphone className="w-5 h-5 text-orange-500" />
          ) : (
            <FileType className="w-5 h-5 text-green-600" />
          )}
          <span className="font-semibold text-slate-900">
            {document.document_type_name ?? '種別未設定'}
          </span>
          {document.requires_response && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
              <Mail className="w-3 h-3" />
              要返送
            </span>
          )}
        </div>

        {!document.is_advertisement && (
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <User className="w-4 h-4 text-slate-400" />
            {clientNames.length === 0 ? (
              <span className="text-slate-400">利用者未設定</span>
            ) : (
              <>
                <span>{primaryClient}</span>
                {clientNames.length > 1 && (
                  <span className="text-slate-400">他{clientNames.length - 1}名</span>
                )}
              </>
            )}
          </div>
        )}

        <div className="text-sm text-slate-600">
          <span>含まれるページ: </span>
          <span className="font-mono">
            {pageNumbers.map((num, idx) => (
              <span
                key={num}
                className={num === currentPageNumber ? 'font-bold text-slate-900' : ''}
              >
                {idx > 0 && ', '}
                {num}
              </span>
            ))}
          </span>
        </div>

        {document.office_name && (
          <div className="text-xs text-slate-500">事業所: {document.office_name}</div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
          <button
            onClick={onViewDocuments}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" />
            書類一覧を見る
          </button>

          {onRemoveFromDocument && (
            <button
              onClick={onRemoveFromDocument}
              disabled={disabled}
              className="flex items-center justify-center gap-1 py-2 px-3 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              解除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
