// =============================================================
// src/components/cm-components/fax/CmPdfViewer.tsx
// FAX詳細 - PDFビューワー
//
// ⚠️ このコンポーネントはSSRで動作しません
// 必ず dynamic import + ssr: false で使用してください
// =============================================================

'use client';

import React, { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, AlertCircle } from 'lucide-react';

// PDF.js ワーカーの設定
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

// react-pdf のスタイル
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

type Props = {
  fileId: string;
  pageNumber: number;
  zoom?: number;
  rotation?: number;
  width?: number;
};

export function CmPdfViewer({
  fileId,
  pageNumber,
  zoom = 100,
  rotation = 0,
  width = 700,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pdfUrl = `/api/cm/fax/pdf/${fileId}`;
  const scaledWidth = (width * zoom) / 100;

  const handleDocumentLoadSuccess = useCallback(
    ({ numPages: pages }: { numPages: number }) => {
      setNumPages(pages);
      setLoadingDoc(false);
      setError(null);
    },
    []
  );

  const handleDocumentLoadError = useCallback((err: Error) => {
    console.error('[CmPdfViewer] Load error:', err);
    setLoadingDoc(false);
    setError('PDFの読み込みに失敗しました');
  }, []);

  return (
    <div className="relative flex items-center justify-center bg-slate-100 min-h-[600px]">
      {loadingDoc && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="text-sm text-slate-500">PDFを読み込み中...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
          <div className="flex flex-col items-center gap-3 text-red-600">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      <Document
        file={pdfUrl}
        onLoadSuccess={handleDocumentLoadSuccess}
        onLoadError={handleDocumentLoadError}
        loading={null}
        className="flex justify-center"
      >
        <Page
          pageNumber={pageNumber}
          width={scaledWidth}
          rotate={rotation}
          loading={null}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className="shadow-lg"
        />
      </Document>

      {!loadingDoc && !error && numPages > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
          {pageNumber} / {numPages}
        </div>
      )}
    </div>
  );
}
