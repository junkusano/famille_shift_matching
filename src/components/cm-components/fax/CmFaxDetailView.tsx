// =============================================================
// src/components/cm-components/fax/CmFaxDetailView.tsx
// FAX詳細画面
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  FileText,
  Building2,
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Save,
  Megaphone,
  User,
  FileType,
  Copy,
  Check,
  SkipForward,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  History,
  Building,
  Search,
  Loader2,
} from 'lucide-react';
import { useCmFaxDetail } from '@/hooks/cm/useCmFaxDetail';
import type { CmFaxOffice } from '@/types/cm/faxDetail';

// react-pdf は SSR で動かないので dynamic import
const CmPdfViewer = dynamic(
  () => import('./CmPdfViewer').then((mod) => mod.CmPdfViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-[700px] h-[900px] bg-white flex items-center justify-center rounded shadow-2xl">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
          <p className="mt-4 text-sm text-gray-500">PDFビューワー読み込み中...</p>
        </div>
      </div>
    ),
  }
);

// =============================================================
// Props
// =============================================================

type Props = {
  faxId: number;
};

// =============================================================
// メインコンポーネント
// =============================================================

export function CmFaxDetailView({ faxId }: Props) {
  const router = useRouter();

  // フック
  const {
    fax,
    clientCandidates,
    documentTypes,
    currentPageData,
    loading,
    error,
    saving,
    currentPage,
    totalPages,
    processedCount,
    isCurrentPageProcessed,
    pageAssignments,
    currentSuggestion,
    previousAssignment,
    hasMeaningfulSuggestion,
    officeSearchQuery,
    setOfficeSearchQuery,
    officeSearchResults,
    officeSearchLoading,
    setCurrentPage,
    goToNextPage,
    goToPrevPage,
    savePage,
    assignOffice,
  } = useCmFaxDetail(faxId);

  // ローカル状態
  const [pdfZoom, setPdfZoom] = useState(100);
  const [appliedRotation, setAppliedRotation] = useState(0);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [showSuggestionReason, setShowSuggestionReason] = useState(false);

  // 事業所関連
  const [showOfficeSearch, setShowOfficeSearch] = useState(false);
  const [showOfficeChangeWarning, setShowOfficeChangeWarning] = useState(false);
  const [pendingOfficeChange, setPendingOfficeChange] = useState<CmFaxOffice | null>(null);
  const [showFaxProxyConfirm, setShowFaxProxyConfirm] = useState(false);

  // フォーム状態
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('');
  const [isAdvertisement, setIsAdvertisement] = useState(false);

  // ---------------------------------------------------------
  // ページ変更時のフォームリセット
  // ---------------------------------------------------------
  useEffect(() => {
    if (!currentPageData) return;

    // 既に保存済みの場合
    const localAssignment = pageAssignments[currentPage];
    if (localAssignment) {
      setSelectedClient(localAssignment.clientId);
      setSelectedDocType(localAssignment.docTypeId.toString());
      setIsAdvertisement(localAssignment.isAd);
      setAppliedRotation(localAssignment.rotation);
      return;
    }

    // DB保存済みの場合
    if (currentPageData.assigned_at) {
      setSelectedClient(currentPageData.assigned_client_id || '');
      setSelectedDocType(currentPageData.document_type_id?.toString() || '');
      setIsAdvertisement(currentPageData.is_advertisement);
      setAppliedRotation(currentPageData.rotation || 0);
      return;
    }

    // 推定がある場合（信頼度が低くない場合）
    if (currentSuggestion && currentSuggestion.confidence !== 'low') {
      setSelectedClient(currentSuggestion.client?.id || '');
      setSelectedDocType(currentSuggestion.docType?.id?.toString() || '');
      setIsAdvertisement(currentSuggestion.isAd);
      setAppliedRotation(currentSuggestion.rotation);
    } else {
      setSelectedClient('');
      setSelectedDocType('');
      setIsAdvertisement(false);
      setAppliedRotation(currentPageData.rotation || 0);
    }

    setShowSuggestionReason(false);
  }, [currentPage, currentPageData, pageAssignments, currentSuggestion]);

  // ---------------------------------------------------------
  // ハンドラー（useCallback）
  // ---------------------------------------------------------

  const handleSaveSuccess = useCallback(() => {
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 1000);
  }, []);

  const handleApplySuggestion = useCallback(async () => {
    if (!currentSuggestion) return;
    const success = await savePage(
      currentSuggestion.client?.id || '',
      currentSuggestion.docType?.id || 0,
      currentSuggestion.isAd,
      currentSuggestion.rotation
    );
    if (success) {
      handleSaveSuccess();
      if (currentPage < totalPages) {
        setTimeout(goToNextPage, 300);
      }
    }
  }, [currentSuggestion, savePage, currentPage, totalPages, goToNextPage, handleSaveSuccess]);

  const handleSameAsPrevious = useCallback(async () => {
    if (!previousAssignment) return;
    const success = await savePage(
      previousAssignment.clientId,
      previousAssignment.docTypeId,
      previousAssignment.isAd,
      previousAssignment.rotation
    );
    if (success) {
      handleSaveSuccess();
      if (currentPage < totalPages) {
        setTimeout(goToNextPage, 300);
      }
    }
  }, [previousAssignment, savePage, currentPage, totalPages, goToNextPage, handleSaveSuccess]);

  // ---------------------------------------------------------
  // キーボードショートカット
  // ---------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // フォーム入力中は無視
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'Enter' && !isCurrentPageProcessed) {
        e.preventDefault();
        if (hasMeaningfulSuggestion) {
          handleApplySuggestion();
        } else if (previousAssignment && !previousAssignment.isAd) {
          handleSameAsPrevious();
        }
      }
      if (e.key === 'ArrowRight') {
        goToNextPage();
      }
      if (e.key === 'ArrowLeft') {
        goToPrevPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCurrentPageProcessed, hasMeaningfulSuggestion, previousAssignment, goToNextPage, goToPrevPage, handleApplySuggestion, handleSameAsPrevious]);

  // ---------------------------------------------------------
  // その他のハンドラー
  // ---------------------------------------------------------

  const handleSave = async () => {
    const success = await savePage(
      selectedClient,
      parseInt(selectedDocType) || 0,
      isAdvertisement,
      appliedRotation
    );
    if (success) {
      handleSaveSuccess();
      if (currentPage < totalPages) {
        setTimeout(goToNextPage, 300);
      }
    }
  };

  const handleMarkAsAd = async () => {
    const success = await savePage('', 0, true, appliedRotation);
    if (success) {
      handleSaveSuccess();
      if (currentPage < totalPages) {
        setTimeout(goToNextPage, 300);
      }
    }
  };

  const handleSkip = () => {
    goToNextPage();
  };

  const handleRotate = () => {
    setAppliedRotation((appliedRotation + 90) % 360);
  };

  // 事業所選択
  const handleOfficeSelect = (office: CmFaxOffice) => {
    // 既に入力済みデータがある場合は警告
    if (processedCount > 0 && fax?.office_id) {
      setPendingOfficeChange(office);
      setShowOfficeChangeWarning(true);
      return;
    }
    applyOfficeChange(office);
  };

  const applyOfficeChange = (office: CmFaxOffice) => {
    // FAX番号が異なる場合はfax_proxy登録確認
    if (
      fax &&
      office.fax_number !== fax.fax_number &&
      office.fax_proxy !== fax.fax_number
    ) {
      setPendingOfficeChange(office);
      setShowFaxProxyConfirm(true);
      return;
    }

    assignOffice(office.id);
    setShowOfficeSearch(false);
    setOfficeSearchQuery('');
  };

  const confirmOfficeChange = async () => {
    if (pendingOfficeChange) {
      await applyOfficeChange(pendingOfficeChange);
    }
    setShowOfficeChangeWarning(false);
    setPendingOfficeChange(null);
  };

  const confirmFaxProxy = async (register: boolean) => {
    if (pendingOfficeChange) {
      await assignOffice(pendingOfficeChange.id, register);
    }
    setShowFaxProxyConfirm(false);
    setShowOfficeSearch(false);
    setOfficeSearchQuery('');
    setPendingOfficeChange(null);
  };

  // 信頼度ラベル
  const getConfidenceLabel = (confidence: string) => {
    if (confidence === 'high') return { text: '確度 高', style: 'text-teal-700 bg-teal-50' };
    if (confidence === 'medium') return { text: '確度 中', style: 'text-amber-700 bg-amber-50' };
    return { text: '確度 低', style: 'text-slate-500 bg-slate-100' };
  };

  // ---------------------------------------------------------
  // ローディング・エラー
  // ---------------------------------------------------------
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto" />
          <p className="mt-4 text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !fax) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="mt-4 text-gray-700 font-medium">エラーが発生しました</p>
          <p className="mt-2 text-gray-500 text-sm">{error || 'FAXが見つかりません'}</p>
          <button
            onClick={() => router.push('/cm-portal/fax')}
            className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm"
          >
            一覧へ戻る
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // メインレンダリング
  // ---------------------------------------------------------
  return (
    <div
      className="h-screen bg-gray-50 flex flex-col"
      style={{ fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {/* ========== Header ========== */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* 戻るボタン */}
              <button
                onClick={() => router.push('/cm-portal/fax')}
                className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors text-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                一覧へ
              </button>
              <div className="h-5 w-px bg-gray-200" />

              {/* 事業所表示・検索 */}
              <div className="relative">
                {fax.office_id ? (
                  // 事業所確定済み
                  <button
                    onClick={() => setShowOfficeSearch(!showOfficeSearch)}
                    className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-2 py-1.5 -ml-2 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-900 text-sm">
                        {fax.office_name}
                      </div>
                      <div className="text-xs text-gray-400">
                        {fax.fax_number} • {new Date(fax.received_at).toLocaleString('ja-JP')}
                      </div>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                ) : (
                  // 事業所未割当
                  <button
                    onClick={() => setShowOfficeSearch(true)}
                    className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-amber-800 text-sm">事業所未割当</div>
                      <div className="text-xs text-amber-600">
                        {fax.fax_number} • クリックして検索
                      </div>
                    </div>
                    <Search className="w-4 h-4 text-amber-500" />
                  </button>
                )}

                {/* 事業所検索ドロップダウン */}
                {showOfficeSearch && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                    <div className="p-3 border-b border-gray-100">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={officeSearchQuery}
                          onChange={(e) => setOfficeSearchQuery(e.target.value)}
                          placeholder="事業所名・FAX番号で検索"
                          className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {officeSearchLoading ? (
                        <div className="px-4 py-6 text-center">
                          <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                        </div>
                      ) : officeSearchResults.length > 0 ? (
                        officeSearchResults.map((office) => (
                          <button
                            key={office.id}
                            onClick={() => handleOfficeSelect(office)}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 ${
                              fax.office_id === office.id ? 'bg-teal-50' : ''
                            }`}
                          >
                            <div className="font-medium text-gray-900 text-sm">
                              {office.office_name}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              FAX: {office.fax_number}
                              {office.fax_proxy && (
                                <span className="ml-2">（代理: {office.fax_proxy}）</span>
                              )}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-6 text-center">
                          <div className="text-gray-400 text-sm">該当する事業所がありません</div>
                          <div className="text-xs text-gray-400 mt-1">
                            カイポケの対事業所情報に登録してください
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2 border-t border-gray-100 bg-gray-50">
                      <button
                        onClick={() => {
                          setShowOfficeSearch(false);
                          setOfficeSearchQuery('');
                        }}
                        className="w-full text-center text-xs text-gray-500 hover:text-gray-700 py-1"
                      >
                        閉じる
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 進捗バー */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {processedCount}/{totalPages}
                </span>
                <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 transition-all duration-300 rounded-full"
                    style={{ width: `${(processedCount / totalPages) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ========== Main ========== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ========== PDF Viewer ========== */}
        <div className="flex-1 flex flex-col bg-gray-800">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50">
            <div className="flex items-center gap-1">
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <span className="text-white text-sm px-3 tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPdfZoom(Math.max(50, pdfZoom - 10))}
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
              >
                <ZoomOut className="w-4 h-4 text-white/70" />
              </button>
              <span className="text-white/70 text-xs w-10 text-center tabular-nums">
                {pdfZoom}%
              </span>
              <button
                onClick={() => setPdfZoom(Math.min(200, pdfZoom + 10))}
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
              >
                <ZoomIn className="w-4 h-4 text-white/70" />
              </button>
              <div className="w-px h-4 bg-white/20 mx-2" />
              <button
                onClick={handleRotate}
                className="p-1.5 rounded hover:bg-white/10 transition-colors flex items-center gap-1"
              >
                <RotateCw className="w-4 h-4 text-white/70" />
                {appliedRotation !== 0 && (
                  <span className="text-xs text-white/70">{appliedRotation}°</span>
                )}
              </button>
            </div>
          </div>

          {/* Viewer */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-6 relative">
            {fax.file_id ? (
              <CmPdfViewer
                fileId={fax.file_id}
                pageNumber={currentPage}
                zoom={pdfZoom}
                rotation={appliedRotation}
              />
            ) : (
              // file_idがない場合のフォールバック
              <div 
                className="w-[595px] h-[842px] bg-white flex items-center justify-center rounded shadow-2xl transition-transform duration-200"
                style={{
                  transform: `scale(${pdfZoom / 100}) rotate(${appliedRotation}deg)`,
                }}
              >
                <div className="text-center text-gray-300">
                  <FileText className="w-12 h-12 mx-auto mb-3 stroke-1" />
                  <p className="text-sm">PDFを読み込めません</p>
                  <p className="text-xs mt-2 text-gray-400">
                    file_id: {fax.file_id || 'なし'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Thumbnails */}
          <div className="flex items-center gap-1.5 p-2.5 bg-gray-900/50 overflow-x-auto">
            {fax.pages.map((page) => {
              const assignment = pageAssignments[page.page_number];
              const isProcessed = !!assignment || !!page.assigned_at;
              const isCurrent = currentPage === page.page_number;
              const hasSugg =
                (page.kaipoke_cs_id || page.suggested_doc_type_id || page.suggested_is_ad) &&
                (page.suggested_confidence || 0) >= 0.5;

              return (
                <button
                  key={page.page_number}
                  onClick={() => setCurrentPage(page.page_number)}
                  className={`flex-shrink-0 w-10 h-14 rounded border transition-all flex flex-col items-center justify-center gap-0.5 ${
                    isCurrent
                      ? 'border-white bg-white/20 ring-1 ring-white/50'
                      : isProcessed
                      ? 'border-teal-400/50 bg-teal-500/20 hover:bg-teal-500/30'
                      : hasSugg
                      ? 'border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/20'
                      : 'border-white/20 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span className="text-[10px] text-white/80 font-medium">
                    {page.page_number}
                  </span>
                  {isProcessed && <Check className="w-3 h-3 text-teal-400" />}
                  {!isProcessed && hasSugg && <Sparkles className="w-3 h-3 text-amber-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ========== Right Panel ========== */}
        <div className="w-[380px] bg-white border-l border-gray-200 flex flex-col">
          {/* Panel Header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900">ページ {currentPage}</div>
                <div className="text-xs text-gray-400 mt-0.5">振り分け情報を設定</div>
              </div>
              {isCurrentPageProcessed && (
                <span className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-medium">
                  <Check className="w-3.5 h-3.5" />
                  設定済み
                </span>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-5">
              {/* AI推定カード */}
              {hasMeaningfulSuggestion && !isCurrentPageProcessed && currentSuggestion && (
                <div
                  className={`rounded-xl border overflow-hidden ${
                    'border-amber-200 bg-amber-50/50'
                  }`}
                >
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-amber-100">
                          <Sparkles className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-sm">自動推定</span>
                            {currentSuggestion.confidence && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  getConfidenceLabel(currentSuggestion.confidence).style
                                }`}
                              >
                                {getConfidenceLabel(currentSuggestion.confidence).text}
                              </span>
                            )}
                          </div>
                          {/* 推定内容サマリー */}
                          <p className="text-xs text-gray-600 mt-1 truncate">
                            {currentSuggestion.isAd ? (
                              '広告・案内'
                            ) : (
                              <>
                                {currentSuggestion.client?.name || '利用者なし'}
                                {currentSuggestion.docType &&
                                  ` / ${currentSuggestion.docType.name}`}
                              </>
                            )}
                          </p>

                          {/* 推定理由（トグル） */}
                          {currentSuggestion.reason && (
                            <button
                              onClick={() => setShowSuggestionReason(!showSuggestionReason)}
                              className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 mt-1.5"
                            >
                              {showSuggestionReason ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                              なぜこの推定？
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={handleApplySuggestion}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-medium transition-colors flex-shrink-0 disabled:opacity-50"
                      >
                        確定
                        <kbd className="text-[9px] bg-white/20 px-1 py-0.5 rounded">↵</kbd>
                      </button>
                    </div>

                    {showSuggestionReason && currentSuggestion.reason && (
                      <div className="mt-3 ml-11 p-2.5 bg-white rounded-lg border border-amber-100 text-xs text-gray-500 space-y-1">
                        <div className="flex items-start gap-2">
                          <Search className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span>{currentSuggestion.reason.detail}</span>
                        </div>
                        {currentSuggestion.reason.secondary && (
                          <div className="flex items-start gap-2">
                            <History className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <span>{currentSuggestion.reason.secondary}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 推定なし/低信頼度の場合 */}
              {!hasMeaningfulSuggestion &&
                !isCurrentPageProcessed &&
                currentSuggestion?.confidence === 'low' && (
                  <div className="p-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-600 text-sm">
                          自動推定できませんでした
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          手動で設定してください
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {/* 前ページと同じ */}
              {!hasMeaningfulSuggestion &&
                previousAssignment &&
                !previousAssignment.isAd &&
                !isCurrentPageProcessed && (
                  <button
                    onClick={handleSameAsPrevious}
                    disabled={saving}
                    className="w-full p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-all text-left disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Copy className="w-5 h-5 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">前ページと同じ</div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate">
                          {previousAssignment.clientName || '利用者なし'} /{' '}
                          {previousAssignment.docTypeName}
                        </div>
                      </div>
                      <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        Enter
                      </kbd>
                    </div>
                  </button>
                )}

              {/* セパレータ */}
              {!isCurrentPageProcessed && (
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 bg-white text-xs text-gray-400">
                      {hasMeaningfulSuggestion ? '修正する場合' : '手動で設定'}
                    </span>
                  </div>
                </div>
              )}

              {/* 広告マーク */}
              <button
                onClick={handleMarkAsAd}
                disabled={saving}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left disabled:opacity-50 ${
                  isAdvertisement
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Megaphone
                  className={`w-5 h-5 ${isAdvertisement ? 'text-orange-500' : 'text-gray-400'}`}
                />
                <span
                  className={`text-sm font-medium ${
                    isAdvertisement ? 'text-orange-700' : 'text-gray-600'
                  }`}
                >
                  広告・案内としてマーク
                </span>
              </button>

              {/* 利用者選択 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                  <User className="w-3.5 h-3.5" />
                  利用者
                </label>

                {!fax.office_id ? (
                  // 事業所未選択
                  <div className="p-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 text-center">
                    <User className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">事業所を選択してください</p>
                    <p className="text-xs text-gray-400 mt-1">利用者候補が表示されます</p>
                  </div>
                ) : clientCandidates.length === 0 ? (
                  // 利用者がいない
                  <div className="p-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 text-center">
                    <User className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">利用者がいません</p>
                    <p className="text-xs text-gray-400 mt-1">
                      この事業所に紐づく利用者がありません
                    </p>
                  </div>
                ) : (
                  // 利用者リスト
                  <div className="space-y-1.5">
                    {clientCandidates.map((client) => {
                      const isSuggested = currentSuggestion?.client?.id === client.id;
                      return (
                        <button
                          key={client.id}
                          onClick={() => setSelectedClient(client.id)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                            selectedClient === client.id
                              ? 'border-teal-500 bg-teal-50'
                              : isSuggested
                              ? 'border-amber-300 bg-amber-50/50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-900 text-sm">
                                {client.name}
                              </span>
                              <span className="text-xs text-gray-400 ml-2">{client.kana}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isSuggested && <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                              {client.care_level && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    client.care_level.includes('要介護')
                                      ? 'bg-orange-100 text-orange-600'
                                      : 'bg-blue-100 text-blue-600'
                                  }`}
                                >
                                  {client.care_level}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 文書種別 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                  <FileType className="w-3.5 h-3.5" />
                  文書種別
                </label>
                <select
                  value={selectedDocType}
                  onChange={(e) => setSelectedDocType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">選択してください</option>
                  {currentSuggestion?.docType && (
                    <optgroup label="★ 推定">
                      <option value={currentSuggestion.docType.id}>
                        {currentSuggestion.docType.name}
                      </option>
                    </optgroup>
                  )}
                  {['実績系', '計画系', 'アセスメント系', '連絡系'].map((category) => (
                    <optgroup key={category} label={category}>
                      {documentTypes
                        .filter((d) => d.category === category)
                        .map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-100 space-y-2">
            <button
              onClick={handleSave}
              disabled={saving || (!selectedClient && !selectedDocType && !isAdvertisement)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              保存して次へ
            </button>

            <button
              onClick={handleSkip}
              disabled={currentPage === totalPages}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors disabled:text-gray-300"
            >
              <SkipForward className="w-4 h-4" />
              スキップ
            </button>

            <div className="text-center text-[10px] text-gray-400 pt-1">
              <kbd className="px-1 py-0.5 bg-gray-100 rounded">←</kbd>
              <kbd className="px-1 py-0.5 bg-gray-100 rounded mx-1">→</kbd>
              ページ移動
            </div>
          </div>
        </div>
      </div>

      {/* ========== Toast ========== */}
      {showSaveSuccess && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg shadow-lg text-sm">
            <Check className="w-4 h-4" />
            保存しました
          </div>
        </div>
      )}

      {/* ========== 事業所変更警告モーダル ========== */}
      {showOfficeChangeWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[420px] overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">事業所を変更しますか？</h3>
                  <p className="text-sm text-gray-500 mt-0.5">入力済みデータに影響があります</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">変更後の事業所</div>
                <div className="font-medium text-gray-900">{pendingOfficeChange?.office_name}</div>
              </div>
              <div className="text-sm text-gray-600">
                既に <span className="font-semibold text-gray-900">{processedCount}ページ</span>{' '}
                の振り分けが完了しています。
                事業所を変更すると利用者候補が変わるため、入力済みの利用者が候補外になる可能性があります。
              </div>
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => confirmOfficeChange()}
                  className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  入力済みデータを保持して変更
                </button>
                <button
                  onClick={() => confirmOfficeChange()}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  入力済みデータをクリアして変更
                </button>
                <button
                  onClick={() => {
                    setShowOfficeChangeWarning(false);
                    setPendingOfficeChange(null);
                  }}
                  className="w-full px-4 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== FAX代理番号登録確認モーダル ========== */}
      {showFaxProxyConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[420px] overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Building className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">FAX代理番号を登録しますか？</h3>
                  <p className="text-sm text-gray-500 mt-0.5">次回以降、自動的に紐付けされます</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                <div>
                  <div className="text-xs text-gray-500">選択した事業所</div>
                  <div className="font-medium text-gray-900">{pendingOfficeChange?.office_name}</div>
                  <div className="text-xs text-gray-400">
                    登録FAX: {pendingOfficeChange?.fax_number}
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-2">
                  <div className="text-xs text-gray-500">このFAXの送信元番号</div>
                  <div className="font-medium text-blue-600">{fax.fax_number}</div>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                送信元FAX番号が事業所の登録番号と異なります。
                代理番号として登録すると、次回以降このFAX番号からの受信は自動的にこの事業所に紐付けられます。
              </div>
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => confirmFaxProxy(true)}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  代理番号として登録する
                </button>
                <button
                  onClick={() => confirmFaxProxy(false)}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  今回だけ紐付ける（登録しない）
                </button>
                <button
                  onClick={() => {
                    setShowFaxProxyConfirm(false);
                    setPendingOfficeChange(null);
                  }}
                  className="w-full px-4 py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}