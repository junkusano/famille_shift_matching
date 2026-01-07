// =============================================================
// src/components/cm-components/fax/CmPdfViewer.tsx
// react-pdf 8.0.2 で PDF を表示（Next.js 15 対応版）
// =============================================================

'use client';

import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, ExternalLink, AlertCircle } from 'lucide-react';

// =============================================================
// PDF.js Worker 設定（CDN経由 - 最も安定）
// react-pdf 8.0.2 は pdfjs-dist 3.11.174 を使用
// =============================================================
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

// react-pdf のスタイル
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// =============================================================
// Types
// =============================================================

type Props = {
  fileId: string;
  pageNumber: number;
  rotation: number;
  zoom: number;
};

// =============================================================
// Component
// =============================================================

export function CmPdfViewer({
  fileId,
  pageNumber,
  rotation,
  zoom,
}: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const pdfUrl = `/api/cm/fax/pdf/${fileId}`;
  const driveUrl = `https://drive.google.com/file/d/${fileId}/view`;

  const baseWidth = 595;
  const scaledWidth = baseWidth * (zoom / 100);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
  };

  const onDocumentLoadError = (err: Error) => {
    console.error('[CmPdfViewer] PDF load error:', err);
    setError('PDFの読み込みに失敗しました');
  };

  // ローディング表示コンポーネント
  const LoadingComponent = (
    <div className="w-[595px] h-[842px] flex items-center justify-center bg-white">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
        <p className="mt-4 text-sm text-gray-500">PDF読み込み中...</p>
      </div>
    </div>
  );

  // エラー表示コンポーネント
  const ErrorComponent = (
    <div className="w-[595px] h-[842px] flex items-center justify-center bg-white">
      <div className="text-center text-red-500">
        <AlertCircle className="w-8 h-8 mx-auto" />
        <p className="mt-4 text-sm">{error || 'PDFの読み込みに失敗しました'}</p>
        <a
          href={driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-xs text-blue-500 hover:underline flex items-center justify-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          Google Driveで開く
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center">
      <div className="bg-white shadow-2xl rounded overflow-hidden">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={LoadingComponent}
          error={ErrorComponent}
        >
          <Page
            pageNumber={pageNumber}
            rotate={rotation}
            width={scaledWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <p className="text-xs text-white/50">
          ページ {pageNumber} / {numPages || '...'}
        </p>
        <a
          href={driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/50 hover:text-white/70 flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          別タブで開く
        </a>
      </div>
    </div>
  );
}