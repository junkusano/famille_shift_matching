// =============================================================
// src/components/cm-components/fax/CmFaxDetailContent.tsx
// FAX詳細 - メインコンポーネント
//
// 【v3.1対応】
// - 2カラム構成（左: PDF+下サムネ / 右: パネル）
// - ダーク背景（bg-gray-900）
// - PDFツールバー: ダーク（bg-gray-800）
// - サムネイル: PDF下部に横並び
// - アクセントカラー: teal系
// - ドラッグ&ドロップによるページ順並び替え
// =============================================================

'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ArrowDownUp,
  Save,
  Loader2,
} from 'lucide-react';

import { CmFaxDetailHeader } from './CmFaxDetailHeader';
import { CmFaxThumbnails } from './CmFaxThumbnails';
import { CmFaxSuggestionCard } from './CmFaxSuggestionCard';
import { CmFaxDocTypeSelector } from './CmFaxDocTypeSelector';
import { CmFaxClientSelector } from './CmFaxClientSelector';
import { CmFaxExistingDocuments } from './CmFaxExistingDocuments';
import { CmFaxDocumentsList } from './CmFaxDocumentsList';
import { CmFaxOfficeModal } from './CmFaxOfficeModal';
import { CmFaxAssignedPageInfo } from './CmFaxAssignedPageInfo';
import { CmFaxToast, useToast } from './CmFaxToast';

import type {
  CmFaxReceived,
  CmFaxPage,
  CmFaxDocument,
  CmFaxReceivedOffice,
  CmClientCandidate,
  CmDocumentType,
  CmProcessingStatus,
  CmSelectedClient,
  CmPageSuggestion,
  CmFaxDetailTabId,
  CmOfficeSearchResult,
} from '@/types/cm/faxDetail';

// =============================================================
// PDFビューワー（dynamic import - SSR無効）
// =============================================================

const CmPdfViewer = dynamic(
  () => import('./CmPdfViewer').then((mod) => mod.CmPdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-gray-700">
        <div className="flex flex-col items-center gap-2 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">PDFを読み込み中...</span>
        </div>
      </div>
    ),
  }
);

// =============================================================
// Props
// =============================================================

type Props = {
  fax: CmFaxReceived;
  pages: CmFaxPage[];
  offices: CmFaxReceivedOffice[];
  documents: CmFaxDocument[];
  clients: CmClientCandidate[];
  documentTypes: CmDocumentType[];
  processingStatus: CmProcessingStatus | null;
  loading: boolean;
  onRefresh: () => void;

  currentPage: number;
  currentPageData: CmFaxPage | null;
  pageOrder: number[];
  setPageOrder: (order: number[]) => void;
  goToPage: (pageNumber: number) => void;
  goToNextUnassigned: () => void;
  reversePageOrder: () => void;
  zoom: number;
  setZoom: (value: number) => void;
  rotation: number;
  setRotation: (value: number) => void;

  selectedClients: CmSelectedClient[];
  setSelectedClients: (clients: CmSelectedClient[]) => void;
  toggleClientSelection: (client: CmClientCandidate) => void;
  clearSelectedClients: () => void;
  selectedDocType: number | null;
  setSelectedDocType: (id: number | null) => void;
  addToExistingDocument: CmFaxDocument | null;
  setAddToExistingDocument: (doc: CmFaxDocument | null) => void;
  requiresResponse: boolean;
  setRequiresResponse: (value: boolean) => void;

  selectedOfficeFilter: number | null;
  setSelectedOfficeFilter: (id: number | null) => void;
  clientSearch: string;
  setClientSearch: (query: string) => void;
  filteredClients: CmClientCandidate[];

  getCurrentPageSuggestion: () => CmPageSuggestion | null;
  applySuggestion: () => void;

  saveDocument: () => Promise<{ ok: boolean; error?: string }>;
  addPagesToDocument: (documentId: number, pageIds: number[]) => Promise<{ ok: boolean; error?: string }>;
  removePageFromDocument?: (documentId: number, pageNumber: number) => Promise<{ ok: boolean; error?: string }>;

  officeSearchQuery: string;
  setOfficeSearchQuery: (query: string) => void;
  officeSearchResults: CmOfficeSearchResult[];
  searchOffices: (query: string) => Promise<void>;
  addOffice: (officeId: number, registerFaxProxy: boolean) => Promise<{ ok: boolean; error?: string }>;
};

const ADVERTISEMENT_DOC_TYPE_ID = 8;

// =============================================================
// コンポーネント
// =============================================================

export function CmFaxDetailContent({
  fax,
  pages,
  offices,
  documents,
  documentTypes,
  processingStatus,
  loading,
  onRefresh,
  currentPage,
  currentPageData,
  pageOrder,
  setPageOrder,
  goToPage,
  goToNextUnassigned,
  reversePageOrder,
  zoom,
  setZoom,
  rotation,
  setRotation,
  selectedClients,
  setSelectedClients,
  toggleClientSelection,
  clearSelectedClients,
  selectedDocType,
  setSelectedDocType,
  addToExistingDocument,
  setAddToExistingDocument,
  requiresResponse,
  setRequiresResponse,
  selectedOfficeFilter,
  setSelectedOfficeFilter,
  clientSearch,
  setClientSearch,
  filteredClients,
  getCurrentPageSuggestion,
  applySuggestion,
  saveDocument,
  addPagesToDocument,
  removePageFromDocument,
  officeSearchQuery,
  setOfficeSearchQuery,
  officeSearchResults,
  searchOffices,
  addOffice,
}: Props) {
  const { toast, success, error, hideToast } = useToast();
  const [activeTab, setActiveTab] = useState<CmFaxDetailTabId>('assign');
  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedPage, setDraggedPage] = useState<number | null>(null);

  // 現在のページが割り当てられている書類
  const currentPageAssignment = currentPageData
    ? documents.find((doc) => doc.page_ids?.includes(currentPageData.id))
    : null;

  const currentSuggestion = getCurrentPageSuggestion();
  const isAdvertisementSelected = selectedDocType === ADVERTISEMENT_DOC_TYPE_ID;

  // 保存可能条件
  const canSave =
    currentPageData &&
    !currentPageAssignment &&
    ((selectedDocType !== null && (isAdvertisementSelected || selectedClients.length > 0)) ||
      addToExistingDocument !== null);

  // ---------------------------------------------------------
  // ドラッグ&ドロップ処理
  // ---------------------------------------------------------
  const handleDragStart = useCallback((pageNum: number) => {
    setDraggedPage(pageNum);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetPageNum: number) => {
      e.preventDefault();
      if (draggedPage === null || draggedPage === targetPageNum) return;

      const newOrder = [...pageOrder];
      const draggedIdx = newOrder.indexOf(draggedPage);
      const targetIdx = newOrder.indexOf(targetPageNum);

      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedPage);

      setPageOrder(newOrder);
    },
    [draggedPage, pageOrder, setPageOrder]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedPage(null);
  }, []);

  // ---------------------------------------------------------
  // 保存処理
  // ---------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setIsSaving(true);
    try {
      if (addToExistingDocument) {
        const result = await addPagesToDocument(addToExistingDocument.id, [currentPageData!.id]);

        if (result.ok) {
          success('ページを書類に追加しました');
          goToNextUnassigned();
        } else {
          error(result.error || '保存に失敗しました');
        }
      } else {
        const result = await saveDocument();

        if (result.ok) {
          success('書類を保存しました');
          goToNextUnassigned();
        } else {
          error(result.error || '保存に失敗しました');
        }
      }
    } catch (err) {
      console.error('保存エラー:', err);
      error('保存中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  }, [canSave, addToExistingDocument, currentPageData, addPagesToDocument, saveDocument, success, error, goToNextUnassigned]);

  // ---------------------------------------------------------
  // AI推定を適用して保存
  // ---------------------------------------------------------
  const handleApplySuggestionAndSave = useCallback(async () => {
    if (!currentSuggestion || !currentPageData) return;

    setIsSaving(true);
    try {
      applySuggestion();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await saveDocument();

      if (result.ok) {
        success('AI推定を適用して保存しました');
        goToNextUnassigned();
      } else {
        error(result.error || '保存に失敗しました');
      }
    } catch (err) {
      console.error('保存エラー:', err);
      error('保存中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  }, [currentSuggestion, currentPageData, applySuggestion, saveDocument, success, error, goToNextUnassigned]);

  // ---------------------------------------------------------
  // 主利用者設定
  // ---------------------------------------------------------
  const handleSetPrimaryClient = useCallback(
    (kaipokeCSId: string) => {
      const updated = selectedClients.map((c) => ({
        ...c,
        isPrimary: c.kaipokeCSId === kaipokeCSId,
      }));
      setSelectedClients(updated);
    },
    [selectedClients, setSelectedClients]
  );

  // ---------------------------------------------------------
  // 書類一覧からページ追加モードに切り替え
  // ---------------------------------------------------------
  const handleAddPagesFromDocuments = useCallback(
    (document: CmFaxDocument) => {
      setAddToExistingDocument(document);
      setActiveTab('assign');
    },
    [setAddToExistingDocument]
  );

  // ---------------------------------------------------------
  // 書類からページを削除
  // ---------------------------------------------------------
  const handleRemovePageFromDocument = useCallback(async () => {
    if (!currentPageAssignment || !currentPageData || !removePageFromDocument) return;

    setIsSaving(true);
    try {
      const result = await removePageFromDocument(currentPageAssignment.id, currentPage);
      if (result.ok) {
        success('ページを書類から削除しました');
      } else {
        error(result.error || '削除に失敗しました');
      }
    } catch (err) {
      console.error('削除エラー:', err);
      error('削除中にエラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  }, [currentPageAssignment, currentPageData, currentPage, removePageFromDocument, success, error]);

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="h-screen flex flex-col bg-gray-900 font-sans">
      {/* ヘッダー */}
      <CmFaxDetailHeader
        fax={fax}
        offices={offices}
        processingStatus={processingStatus}
        loading={loading}
        onRefresh={onRefresh}
        onAddOffice={() => setIsOfficeModalOpen(true)}
      />

      {/* メインコンテンツ */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左側: PDFビューワー + サムネイル */}
        <div className="flex-1 flex flex-col">
          {/* PDFツールバー（ダーク） */}
          <div className="h-10 bg-gray-800 flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
              {/* ズーム */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoom(Math.max(50, zoom - 25))}
                  disabled={zoom <= 50}
                  className="p-1.5 text-gray-400 hover:text-white rounded disabled:opacity-30"
                  title="縮小"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-gray-400 text-xs w-12 text-center">{zoom}%</span>
                <button
                  onClick={() => setZoom(Math.min(200, zoom + 25))}
                  disabled={zoom >= 200}
                  className="p-1.5 text-gray-400 hover:text-white rounded disabled:opacity-30"
                  title="拡大"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* 回転 */}
              <button
                onClick={() => setRotation((rotation + 90) % 360)}
                className="p-1.5 text-gray-400 hover:text-white rounded flex items-center gap-1"
                title="回転"
              >
                <RotateCw className="w-4 h-4" />
                <span className="text-xs">{rotation}°</span>
              </button>
            </div>

            {/* ページ順逆転 */}
            <button
              onClick={reversePageOrder}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              title="ページ順を逆転"
            >
              <ArrowDownUp className="w-3.5 h-3.5" />
              ページ順を逆転
            </button>
          </div>

          {/* PDFビューワー */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-gray-900">
            {fax.pdf_drive_file_id ? (
              <div
                className="bg-white shadow-2xl rounded overflow-hidden"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                }}
              >
                <CmPdfViewer
                  fileId={fax.pdf_drive_file_id}
                  pageNumber={currentPage}
                  zoom={zoom}
                  rotation={0} // 回転は親で処理
                />
              </div>
            ) : (
              <div className="text-gray-400 text-center">
                <p>PDFファイルが見つかりません</p>
              </div>
            )}
          </div>

          {/* サムネイル（下部横並び） */}
          <CmFaxThumbnails
            pages={pages}
            pageOrder={pageOrder}
            currentPage={currentPage}
            documents={documents}
            onPageClick={goToPage}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            draggedPage={draggedPage}
          />
        </div>

        {/* 右側: 操作パネル */}
        <div className="w-96 bg-white flex flex-col border-l">
          {/* タブ */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('assign')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'assign'
                  ? 'text-teal-600 border-b-2 border-teal-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              振り分け
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'documents'
                  ? 'text-teal-600 border-b-2 border-teal-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              書類一覧
              {documents.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                  {documents.length}
                </span>
              )}
            </button>
          </div>

          {/* タブコンテンツ */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'assign' ? (
              <>
                {/* 割り当て済みの場合 */}
                {currentPageAssignment ? (
                  <CmFaxAssignedPageInfo
                    document={currentPageAssignment}
                    currentPageNumber={currentPage}
                    onViewDocuments={() => setActiveTab('documents')}
                    onRemoveFromDocument={removePageFromDocument ? handleRemovePageFromDocument : undefined}
                  />
                ) : (
                  <>
                    {/* AI推定カード */}
                    {currentSuggestion && !addToExistingDocument && (
                      <CmFaxSuggestionCard
                        suggestion={currentSuggestion}
                        onApply={handleApplySuggestionAndSave}
                        isApplying={isSaving}
                      />
                    )}

                    {/* 既存書類に追加 */}
                    {documents.length > 0 && (
                      <CmFaxExistingDocuments
                        documents={documents}
                        selectedDocument={addToExistingDocument}
                        onSelect={setAddToExistingDocument}
                        currentPageNumber={currentPage}
                      />
                    )}

                    {/* 新規書類作成フォーム */}
                    {!addToExistingDocument && (
                      <div className="p-3 space-y-4">
                        {/* 文書種別 */}
                        <CmFaxDocTypeSelector
                          documentTypes={documentTypes}
                          selectedDocType={selectedDocType}
                          onSelect={setSelectedDocType}
                          suggestion={currentSuggestion}
                        />

                        {/* 利用者選択（広告以外） */}
                        {!isAdvertisementSelected && selectedDocType && (
                          <CmFaxClientSelector
                            clients={filteredClients}
                            selectedClients={selectedClients}
                            offices={offices}
                            selectedOfficeFilter={selectedOfficeFilter}
                            searchQuery={clientSearch}
                            onSearchChange={setClientSearch}
                            onOfficeFilterChange={setSelectedOfficeFilter}
                            onToggleClient={toggleClientSelection}
                            onClearAll={clearSelectedClients}
                            onSetPrimary={handleSetPrimaryClient}
                            suggestion={currentSuggestion}
                          />
                        )}

                        {/* 返送が必要チェック */}
                        {!isAdvertisementSelected && selectedDocType && (
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={requiresResponse}
                              onChange={(e) => setRequiresResponse(e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500"
                            />
                            返送が必要
                          </label>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              /* 書類一覧タブ */
              <CmFaxDocumentsList
                documents={documents}
                processingStatus={processingStatus}
                onPageClick={goToPage}
                onAddPages={handleAddPagesFromDocuments}
              />
            )}
          </div>

          {/* 保存ボタン（振り分けタブ、未割り当ての場合のみ） */}
          {activeTab === 'assign' && !currentPageAssignment && (
            <div className="p-3 border-t bg-gray-50">
              <button
                onClick={handleSave}
                disabled={!canSave || isSaving}
                className={`w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                  canSave && !isSaving
                    ? 'bg-teal-600 text-white hover:bg-teal-700'
                    : 'bg-gray-300 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {addToExistingDocument ? '書類に追加' : '保存'}
                  </>
                )}
              </button>

              {/* スキップボタン */}
              <button
                onClick={goToNextUnassigned}
                className="w-full py-2 text-gray-500 text-sm hover:text-gray-700 mt-1"
              >
                スキップ →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 事業所追加モーダル */}
      <CmFaxOfficeModal
        isOpen={isOfficeModalOpen}
        onClose={() => setIsOfficeModalOpen(false)}
        faxNumber={fax.fax_number}
        searchQuery={officeSearchQuery}
        onSearchQueryChange={setOfficeSearchQuery}
        searchResults={officeSearchResults}
        isSearching={false}
        onSearch={searchOffices}
        onConfirm={async (officeId, registerFaxProxy) => {
          const result = await addOffice(officeId, registerFaxProxy);
          if (result.ok) {
            success('事業所を追加しました');
            setIsOfficeModalOpen(false);
          } else {
            error(result.error || '追加に失敗しました');
          }
        }}
      />

      {/* トースト通知 */}
      <CmFaxToast toast={toast} onClose={hideToast} />
    </div>
  );
}