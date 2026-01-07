// =============================================================
// src/hooks/cm/useCmFaxDetail.ts
// FAX詳細のデータ取得・状態管理フック
// =============================================================

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type {
  CmFaxDetail,
  CmFaxClientCandidate,
  CmDocumentType,
  CmFaxOffice,
  CmPageAssignment,
  CmPageSuggestion,
} from '@/types/cm/faxDetail';

// =============================================================
// Hook
// =============================================================

export function useCmFaxDetail(faxId: number) {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [fax, setFax] = useState<CmFaxDetail | null>(null);
  const [clientCandidates, setClientCandidates] = useState<CmFaxClientCandidate[]>([]);
  const [documentTypes, setDocumentTypes] = useState<CmDocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ページ状態
  const [currentPage, setCurrentPage] = useState(1);
  const [pageAssignments, setPageAssignments] = useState<Record<number, CmPageAssignment>>({});

  // 事業所検索
  const [officeSearchQuery, setOfficeSearchQuery] = useState('');
  const [officeSearchResults, setOfficeSearchResults] = useState<CmFaxOffice[]>([]);
  const [officeSearchLoading, setOfficeSearchLoading] = useState(false);

  // ---------------------------------------------------------
  // 計算値
  // ---------------------------------------------------------
  const totalPages = fax?.page_count || 0;
  const currentPageData = fax?.pages.find((p) => p.page_number === currentPage) || null;

  // 処理済みページ数
  const processedCount = useMemo(() => {
    if (!fax) return 0;
    return fax.pages.filter((p) => p.assigned_at !== null).length + Object.keys(pageAssignments).length;
  }, [fax, pageAssignments]);

  // 現在のページが処理済みか
  const isCurrentPageProcessed = useMemo(() => {
    if (!currentPageData) return false;
    return currentPageData.assigned_at !== null || !!pageAssignments[currentPage];
  }, [currentPageData, pageAssignments, currentPage]);

  // AI推定情報を構築
  const currentSuggestion = useMemo((): CmPageSuggestion | null => {
    if (!currentPageData) return null;

    // 既に確定済みの場合は推定なし
    if (currentPageData.assigned_at) return null;

    // 推定データがあるか確認
    const hasClient = !!currentPageData.kaipoke_cs_id;
    const hasDocType = !!currentPageData.suggested_doc_type_id;
    const isAd = currentPageData.suggested_is_ad;

    if (!hasClient && !hasDocType && !isAd) return null;

    // 信頼度を判定
    let confidence: 'high' | 'medium' | 'low' = 'low';
    const conf = currentPageData.suggested_confidence;
    if (conf !== null) {
      if (conf >= 0.8) confidence = 'high';
      else if (conf >= 0.5) confidence = 'medium';
    }

    // 推定理由を構築
    let reason: CmPageSuggestion['reason'] = undefined;
    if (currentPageData.suggested_source) {
      const source = currentPageData.suggested_source;
      if (source.includes('ocr')) {
        reason = {
          type: 'ocr_match',
          detail: `OCRで「${currentPageData.suggested_client_name || ''}」を検出`,
        };
      } else if (source.includes('pattern')) {
        reason = {
          type: 'pattern',
          detail: 'この事業所からはこの文書種別が多いパターン',
        };
      } else if (source.includes('ad')) {
        reason = {
          type: 'ad_keyword',
          detail: '広告キーワードを検出',
        };
      }
    }

    return {
      rotation: currentPageData.rotation || 0,
      client: hasClient
        ? { id: currentPageData.kaipoke_cs_id!, name: currentPageData.suggested_client_name || '' }
        : null,
      docType: hasDocType
        ? { id: currentPageData.suggested_doc_type_id!, name: currentPageData.suggested_doc_type_name || '' }
        : null,
      isAd,
      confidence,
      reason,
    };
  }, [currentPageData]);

  // 前ページの振り分け
  const previousAssignment = useMemo((): CmPageAssignment | null => {
    if (currentPage <= 1) return null;

    // まずローカルの振り分けを確認
    if (pageAssignments[currentPage - 1]) {
      return pageAssignments[currentPage - 1];
    }

    // DBに保存済みの振り分けを確認
    const prevPage = fax?.pages.find((p) => p.page_number === currentPage - 1);
    if (prevPage?.assigned_at) {
      return {
        clientId: prevPage.assigned_client_id || '',
        clientName: prevPage.assigned_client_name || '',
        docTypeId: prevPage.document_type_id || 0,
        docTypeName: prevPage.document_type_name || '',
        isAd: prevPage.is_advertisement,
        rotation: prevPage.rotation || 0,
      };
    }

    return null;
  }, [currentPage, pageAssignments, fax]);

  // 意味のある推定があるか
  const hasMeaningfulSuggestion = useMemo(() => {
    if (!currentSuggestion) return false;
    if (currentSuggestion.confidence === 'low') return false;
    return !!(currentSuggestion.client || currentSuggestion.docType || currentSuggestion.isAd);
  }, [currentSuggestion]);

  // ---------------------------------------------------------
  // API呼び出し
  // ---------------------------------------------------------

  // FAX詳細取得
  const fetchFaxDetail = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/cm/fax/${faxId}`, {
        credentials: 'include',
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        return;
      }

      setFax(data.fax);
      setClientCandidates(data.clientCandidates || []);
      setDocumentTypes(data.documentTypes || []);

      // 初期ページ設定（未処理のページがあればそこから）
      const firstUnprocessed = data.fax.pages.find(
        (p: { assigned_at: string | null; page_number: number }) => !p.assigned_at
      );
      if (firstUnprocessed) {
        setCurrentPage(firstUnprocessed.page_number);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [faxId]);

  // 事業所検索
  const searchOffices = useCallback(async (query: string) => {
    setOfficeSearchLoading(true);
    try {
      const res = await fetch(`/api/cm/fax/offices?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) {
        setOfficeSearchResults(data.offices || []);
      }
    } catch (e) {
      console.error('事業所検索エラー:', e);
    } finally {
      setOfficeSearchLoading(false);
    }
  }, []);

  // ページ保存
  const savePage = useCallback(
    async (
      clientId: string,
      docTypeId: number,
      isAd: boolean,
      rotation: number = 0
    ) => {
      if (!currentPageData) return false;

      setSaving(true);
      try {
        const res = await fetch(`/api/cm/fax/${faxId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'save_page',
            page_id: currentPageData.id,
            client_id: clientId || null,
            document_type_id: docTypeId || null,
            is_advertisement: isAd,
            rotation,
          }),
        });

        const data = await res.json();
        if (!data.ok) {
          console.error('保存エラー:', data.error);
          return false;
        }

        // ローカル状態を更新
        const client = clientCandidates.find((c) => c.id === clientId);
        const docType = documentTypes.find((d) => d.id === docTypeId);

        setPageAssignments((prev) => ({
          ...prev,
          [currentPage]: {
            clientId,
            clientName: client?.name || '',
            docTypeId,
            docTypeName: isAd ? '広告・案内' : docType?.name || '',
            isAd,
            rotation,
          },
        }));

        return true;
      } catch (e) {
        console.error('保存例外:', e);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [faxId, currentPageData, currentPage, clientCandidates, documentTypes]
  );

  // 事業所割当
  const assignOffice = useCallback(
    async (officeId: number, registerFaxProxy: boolean = false) => {
      if (!fax) return false;

      setSaving(true);
      try {
        const res = await fetch(`/api/cm/fax/${faxId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'assign_office',
            office_id: officeId,
            register_fax_proxy: registerFaxProxy,
            fax_number: fax.fax_number,
          }),
        });

        const data = await res.json();
        if (!data.ok) {
          console.error('事業所割当エラー:', data.error);
          return false;
        }

        // 再取得
        await fetchFaxDetail();
        return true;
      } catch (e) {
        console.error('事業所割当例外:', e);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [faxId, fax, fetchFaxDetail]
  );

  // ---------------------------------------------------------
  // 初回読み込み
  // ---------------------------------------------------------
  useEffect(() => {
    if (faxId) {
      fetchFaxDetail();
    }
  }, [faxId, fetchFaxDetail]);

  // 事業所検索（デバウンス）
  useEffect(() => {
    const timer = setTimeout(() => {
      searchOffices(officeSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [officeSearchQuery, searchOffices]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  }, [currentPage, totalPages]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  }, [currentPage]);

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    fax,
    clientCandidates,
    documentTypes,
    currentPageData,

    // 状態
    loading,
    error,
    saving,
    currentPage,
    totalPages,
    processedCount,
    isCurrentPageProcessed,
    pageAssignments,

    // 推定
    currentSuggestion,
    previousAssignment,
    hasMeaningfulSuggestion,

    // 事業所検索
    officeSearchQuery,
    setOfficeSearchQuery,
    officeSearchResults,
    officeSearchLoading,

    // ハンドラー
    setCurrentPage,
    goToNextPage,
    goToPrevPage,
    savePage,
    assignOffice,
    refresh: fetchFaxDetail,
  };
}