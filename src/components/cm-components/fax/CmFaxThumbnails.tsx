// =============================================================
// src/components/cm-components/fax/CmFaxThumbnails.tsx
// FAX詳細 - サムネイル一覧（横並び、ドラッグ&ドロップ対応）
//
// 【v3.1対応】
// - 横並びレイアウト（overflow-x）
// - ドラッグ&ドロップでページ順並び替え
// - ダーク背景（bg-gray-800）
// - 選択状態: teal系、割当済み: emerald系
// =============================================================

'use client';

import React from 'react';
import { GripVertical, Check } from 'lucide-react';
import type { CmFaxPage, CmFaxDocument } from '@/types/cm/faxDetail';

type Props = {
  pages: CmFaxPage[];
  pageOrder: number[];
  currentPage: number;
  documents: CmFaxDocument[];
  onPageClick: (pageNumber: number) => void;
  // ドラッグ&ドロップ用
  onDragStart?: (pageNumber: number) => void;
  onDragOver?: (e: React.DragEvent, targetPageNumber: number) => void;
  onDragEnd?: () => void;
  draggedPage?: number | null;
};

export function CmFaxThumbnails({
  pages,
  pageOrder,
  currentPage,
  documents,
  onPageClick,
  onDragStart,
  onDragOver,
  onDragEnd,
  draggedPage = null,
}: Props) {
  // ページが書類に割り当て済みかどうか
  const isPageAssigned = (pageId: number): boolean => {
    return documents.some((doc) => doc.page_ids?.includes(pageId));
  };

  // ページ番号からページデータを取得
  const getPageByNumber = (pageNum: number): CmFaxPage | undefined => {
    return pages.find((p) => p.page_number === pageNum);
  };

  return (
    <div className="h-28 bg-gray-800 px-4 py-2">
      {/* ヘッダー説明 */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-gray-500">ページ順（ドラッグで並べ替え）</span>
        <span className="text-xs text-gray-600">|</span>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-emerald-500 rounded" />
          割当済
        </span>
      </div>

      {/* サムネイル横並び */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {pageOrder.map((pageNum) => {
          const pageData = getPageByNumber(pageNum);
          if (!pageData) return null;

          const isAssigned = isPageAssigned(pageData.id);
          const isCurrent = pageNum === currentPage;
          const isDragging = draggedPage === pageNum;

          return (
            <div
              key={pageNum}
              draggable={!!onDragStart}
              onDragStart={() => onDragStart?.(pageNum)}
              onDragOver={(e) => {
                e.preventDefault();
                onDragOver?.(e, pageNum);
              }}
              onDragEnd={() => onDragEnd?.()}
              onClick={() => onPageClick(pageNum)}
              className={`
                flex-shrink-0 w-14 h-16 rounded border-2 
                flex flex-col items-center justify-center 
                text-xs cursor-pointer transition-all
                ${
                  isCurrent
                    ? 'border-teal-400 bg-teal-500/20'
                    : isAssigned
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                }
                ${isDragging ? 'opacity-50 scale-95' : ''}
                ${onDragStart ? 'cursor-move' : 'cursor-pointer'}
              `}
            >
              {/* ドラッグハンドル */}
              <GripVertical className="w-3 h-3 text-gray-500 mb-0.5" />

              {/* ページ番号 */}
              <span
                className={`font-medium ${
                  isCurrent ? 'text-white' : 'text-gray-400'
                }`}
              >
                P.{pageNum}
              </span>

              {/* 割当済みチェック */}
              {isAssigned && (
                <Check className="w-3 h-3 text-emerald-400 mt-0.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}