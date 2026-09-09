// =============================================================
// src/components/cm-components/fax/CmFaxDocumentsList.tsx
// FAX詳細 - 書類一覧タブ
// =============================================================

'use client';

import React from 'react';
import { FileText, User, FileType, Mail, Plus, Megaphone } from 'lucide-react';
import type { CmFaxDocument, CmProcessingStatus } from '@/types/cm/faxDetail';

type Props = {
  documents: CmFaxDocument[];
  processingStatus: CmProcessingStatus | null;
  onPageClick: (pageNumber: number) => void;
  onAddPages: (document: CmFaxDocument) => void;
  disabled?: boolean;
};

export function CmFaxDocumentsList({
  documents,
  processingStatus,
  onPageClick,
  onAddPages,
  disabled = false,
}: Props) {
  return (
    <div className="space-y-4">
      {processingStatus && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">処理状況</span>
            <span className="font-medium text-slate-900">
              {processingStatus.assigned_pages} / {processingStatus.total_pages} ページ
            </span>
          </div>
          <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${processingStatus.completion_rate * 100}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{documents.length}件の書類</span>
            <span>{Math.round(processingStatus.completion_rate * 100)}% 完了</span>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="p-8 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">まだ書類がありません</p>
          <p className="text-sm text-slate-400 mt-1">
            「振り分け」タブでページを割り当てると、ここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onPageClick={onPageClick}
              onAddPages={() => onAddPages(doc)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type DocumentCardProps = {
  document: CmFaxDocument;
  onPageClick: (pageNumber: number) => void;
  onAddPages: () => void;
  disabled?: boolean;
};

function DocumentCard({ document, onPageClick, onAddPages, disabled = false }: DocumentCardProps) {
  const pageNumbers = document.page_numbers ?? [];
  const clientNames = document.client_names ?? [];
  const primaryClient = clientNames[0];

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        document.is_advertisement ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'
      }`}
    >
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {document.is_advertisement ? (
              <Megaphone className="w-4 h-4 text-orange-500" />
            ) : (
              <FileType className="w-4 h-4 text-blue-500" />
            )}
            <span className="font-medium text-slate-900">
              {document.document_type_name ?? '種別未設定'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {document.requires_response && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                <Mail className="w-3 h-3" />
                要返送
              </span>
            )}
          </div>
        </div>

        {!document.is_advertisement && (
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <User className="w-3.5 h-3.5 text-slate-400" />
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

        {document.office_name && (
          <div className="mt-1 text-xs text-slate-500">{document.office_name}</div>
        )}
      </div>

      <div className="p-3 bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">ページ:</span>
            <div className="flex flex-wrap gap-1">
              {pageNumbers.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => onPageClick(pageNum)}
                  disabled={disabled}
                  className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-200 rounded hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {pageNum}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onAddPages}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-3 h-3" />
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
