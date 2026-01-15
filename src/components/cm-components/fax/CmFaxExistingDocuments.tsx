// =============================================================
// src/components/cm-components/fax/CmFaxExistingDocuments.tsx
// FAX詳細 - 既存書類に追加（泣き別れ対応）
// =============================================================

'use client';

import React from 'react';
import { FileText, Plus, User, FileType, ChevronRight } from 'lucide-react';
import type { CmFaxDocument } from '@/types/cm/faxDetail';

type Props = {
  documents: CmFaxDocument[];
  selectedDocument: CmFaxDocument | null;
  onSelect: (doc: CmFaxDocument | null) => void;
  currentPageNumber: number;
  disabled?: boolean;
};

export function CmFaxExistingDocuments({
  documents,
  selectedDocument,
  onSelect,
  currentPageNumber,
  disabled = false,
}: Props) {
  const availableDocuments = documents.filter(
    (doc) => !doc.page_numbers?.includes(currentPageNumber)
  );

  if (availableDocuments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">既存書類に追加（泣き別れ対応）</span>
      </div>

      <p className="text-xs text-slate-500">分割されてしまった書類をここで統合できます。</p>

      <div className="space-y-2">
        {availableDocuments.map((doc) => {
          const isSelected = selectedDocument?.id === doc.id;
          const primaryClientName = doc.client_names?.[0] ?? '未設定';
          const clientCount = doc.client_names?.length ?? 0;
          const pageNumbers = doc.page_numbers ?? [];

          return (
            <button
              key={doc.id}
              onClick={() => onSelect(isSelected ? null : doc)}
              disabled={disabled}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } ${
                isSelected
                  ? 'bg-purple-50 border-purple-300'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div
                className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? 'bg-purple-600 border-purple-600' : 'border-slate-300'
                }`}
              >
                {isSelected && <Plus className="w-3 h-3 text-white" />}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <FileType className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium text-slate-900 truncate">
                    {doc.document_type_name ?? '種別未設定'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">
                    {primaryClientName}
                    {clientCount > 1 && <span className="text-slate-400 ml-1">他{clientCount - 1}名</span>}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>ページ:</span>
                  <span className="font-mono">{pageNumbers.join(', ')}</span>
                </div>
              </div>

              <ChevronRight
                className={`flex-shrink-0 w-5 h-5 mt-0.5 transition-colors ${
                  isSelected ? 'text-purple-600' : 'text-slate-300'
                }`}
              />
            </button>
          );
        })}
      </div>

      {selectedDocument && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-purple-800">
            <strong className="font-medium">「{selectedDocument.document_type_name ?? '書類'}」</strong>
            にこのページを追加します。
          </p>
          <p className="text-xs text-purple-600 mt-1">
            保存ボタンを押すと、選択中の書類にページが追加されます。
          </p>
        </div>
      )}
    </div>
  );
}
