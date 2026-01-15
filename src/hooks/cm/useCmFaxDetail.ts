// =============================================================
// src/hooks/cm/useCmFaxDetail.ts
// FAX詳細のデータ取得・状態管理フック
//
// 【v3.1対応】
// - setPageOrder を公開（ドラッグ&ドロップ対応）
// - removePageFromDocument を追加（書類からページ削除）
// =============================================================

'use client';

import { useState, useCallback, useEffect } from 'react';
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
  CmFaxDetailApiResponse,
  CmOfficeSearchResult,
} from '@/types/cm/faxDetail';

/** 広告の文書種別ID */
const ADVERTISEMENT_DOC_TYPE_ID = 8;

export function useCmFaxDetail(faxId: number) {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [fax, setFax] = useState<CmFaxReceived | null>(null);
  const [pages, setPages] = useState<CmFaxPage[]>([]);
  const [offices, setOffices] = useState<CmFaxReceivedOffice[]>([]);
  const [documents, setDocuments] = useState<CmFaxDocument[]>([]);
  const [clients, setClients] = useState<CmClientCandidate[]>([]);
  const [documentTypes, setDocumentTypes] = useState<CmDocumentType[]>([]);
  const [processingStatus, setProcessingStatus] = useState<CmProcessingStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ページ操作
  const [currentPage, setCurrentPage] = useState(1);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  // 選択状態
  const [selectedClients, setSelectedClients] = useState<CmSelectedClient[]>([]);
  const [selectedDocType, setSelectedDocType] = useState<number | null>(null);
  const [addToExistingDocument, setAddToExistingDocument] = useState<CmFaxDocument | null>(null);
  const [requiresResponse, setRequiresResponse] = useState(false);

  // フィルター
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState('');

  // 事業所検索
  const [officeSearchQuery, setOfficeSearchQuery] = useState('');
  const [officeSearchResults, setOfficeSearchResults] = useState<CmOfficeSearchResult[]>([]);

  // ---------------------------------------------------------
  // API 呼び出し
  // ---------------------------------------------------------
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/cm/fax/${faxId}`, {
        credentials: 'include',
      });

      const data: CmFaxDetailApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        return;
      }

      setFax(data.fax || null);
      setPages(data.pages || []);
      setOffices(data.offices || []);
      setDocuments(data.documents || []);
      setClients(data.clients || []);
      setDocumentTypes(data.documentTypes || []);
      setProcessingStatus(data.processingStatus || null);

      // ページ順を初期化
      if (data.pages?.length) {
        const order = data.pages
          .sort((a, b) => (a.logical_order ?? a.page_number) - (b.logical_order ?? b.page_number))
          .map((p) => p.page_number);
        setPageOrder(order);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
    } finally {
      setLoading(false);
    }
  }, [faxId]);

  // ---------------------------------------------------------
  // 初回読み込み
  // ---------------------------------------------------------
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------
  // ページ移動時に選択状態をリセット
  // ---------------------------------------------------------
  useEffect(() => {
    setSelectedClients([]);
    setSelectedDocType(null);
    setAddToExistingDocument(null);
    setRequiresResponse(false);
    setRotation(0);
  }, [currentPage]);

  // ---------------------------------------------------------
  // 派生データ
  // ---------------------------------------------------------
  const currentPageData = pages.find((p) => p.page_number === currentPage) || null;

  const filteredClients = clients.filter((client) => {
    // 事業所フィルター
    if (selectedOfficeFilter !== null && client.office_id !== selectedOfficeFilter) {
      return false;
    }
    // 検索フィルター
    if (clientSearch) {
      const search = clientSearch.toLowerCase();
      const searchKatakana = clientSearch.replace(/[\u3041-\u3096]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) + 0x60)
      );
      return (
        client.client_name.toLowerCase().includes(search) ||
        client.client_kana.toLowerCase().includes(search) ||
        client.client_kana.toLowerCase().includes(searchKatakana.toLowerCase())
      );
    }
    return true;
  });

  // ---------------------------------------------------------
  // AI推定取得
  // ---------------------------------------------------------
  const getCurrentPageSuggestion = useCallback((): CmPageSuggestion | null => {
    if (!currentPageData) return null;

    const suggestion: CmPageSuggestion = {
      clients: [],
      docType: null,
      reason: currentPageData.suggested_reason,
      is_advertisement: false,
    };

    // 利用者推定
    if (currentPageData.suggested_client_id && currentPageData.suggested_client_name) {
      suggestion.clients.push({
        kaipoke_cs_id: currentPageData.suggested_client_id,
        client_name: currentPageData.suggested_client_name,
        confidence: currentPageData.suggested_confidence || 0,
      });
    }

    // 文書種別推定
    if (currentPageData.suggested_doc_type_id) {
      const docType = documentTypes.find((d) => d.id === currentPageData.suggested_doc_type_id);
      if (docType) {
        suggestion.docType = {
          id: docType.id,
          name: docType.name,
          confidence: currentPageData.suggested_confidence || 0,
        };
      }

      // 広告判定
      if (currentPageData.suggested_doc_type_id === ADVERTISEMENT_DOC_TYPE_ID) {
        suggestion.is_advertisement = true;
      }
    }

    // 推定がない場合はnull
    if (suggestion.clients.length === 0 && !suggestion.docType) {
      return null;
    }

    return suggestion;
  }, [currentPageData, documentTypes]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const goToPage = useCallback((pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= pages.length) {
      setCurrentPage(pageNumber);
    }
  }, [pages.length]);

  const goToNextUnassigned = useCallback(() => {
    // 現在のページ以降で未割当のページを探す
    for (let i = currentPage; i <= pages.length; i++) {
      const page = pages.find((p) => p.page_number === i);
      if (page) {
        const isAssigned = documents.some((doc) => doc.page_ids?.includes(page.id));
        if (!isAssigned && i !== currentPage) {
          setCurrentPage(i);
          return;
        }
      }
    }
    // 見つからなければ最初から探す
    for (let i = 1; i < currentPage; i++) {
      const page = pages.find((p) => p.page_number === i);
      if (page) {
        const isAssigned = documents.some((doc) => doc.page_ids?.includes(page.id));
        if (!isAssigned) {
          setCurrentPage(i);
          return;
        }
      }
    }
  }, [currentPage, pages, documents]);

  const reversePageOrder = useCallback(() => {
    setPageOrder((prev) => [...prev].reverse());
  }, []);

  const toggleClientSelection = useCallback((client: CmClientCandidate) => {
    setSelectedClients((prev) => {
      const exists = prev.find((c) => c.kaipokeCSId === client.kaipoke_cs_id);
      if (exists) {
        return prev.filter((c) => c.kaipokeCSId !== client.kaipoke_cs_id);
      }
      const isPrimary = prev.length === 0;
      return [
        ...prev,
        {
          kaipokeCSId: client.kaipoke_cs_id,
          name: client.client_name,
          officeId: client.office_id,
          isPrimary,
        },
      ];
    });
  }, []);

  const clearSelectedClients = useCallback(() => {
    setSelectedClients([]);
  }, []);

  const applySuggestion = useCallback(() => {
    const suggestion = getCurrentPageSuggestion();
    if (!suggestion) return;

    // 文書種別を適用
    if (suggestion.docType) {
      setSelectedDocType(suggestion.docType.id);
    }

    // 利用者を適用
    if (suggestion.clients.length > 0) {
      const newClients: CmSelectedClient[] = suggestion.clients.map((c, idx) => ({
        kaipokeCSId: c.kaipoke_cs_id,
        name: c.client_name,
        officeId: clients.find((cl) => cl.kaipoke_cs_id === c.kaipoke_cs_id)?.office_id || 0,
        isPrimary: idx === 0,
      }));
      setSelectedClients(newClients);
    }
  }, [getCurrentPageSuggestion, clients]);

  // ---------------------------------------------------------
  // 書類保存
  // ---------------------------------------------------------
  const saveDocument = useCallback(async () => {
    if (!currentPageData) {
      return { ok: false, error: 'ページが選択されていません' };
    }

    const isAd = selectedDocType === ADVERTISEMENT_DOC_TYPE_ID;

    try {
      const res = await fetch('/api/cm/fax/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fax_received_id: faxId,
          page_ids: [currentPageData.id],
          document_type_id: selectedDocType,
          client_ids: isAd ? [] : selectedClients.map((c) => c.kaipokeCSId),
          client_names: isAd ? [] : selectedClients.map((c) => c.name),
          office_id: selectedClients[0]?.officeId || null,
          is_advertisement: isAd,
          requires_response: requiresResponse,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        await fetchData();
      }

      return data;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '保存エラー' };
    }
  }, [faxId, currentPageData, selectedDocType, selectedClients, requiresResponse, fetchData]);

  // ---------------------------------------------------------
  // 既存書類にページ追加
  // ---------------------------------------------------------
  const addPagesToDocument = useCallback(async (documentId: number, pageIds: number[]) => {
    try {
      const res = await fetch(`/api/cm/fax/documents/${documentId}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ page_ids: pageIds }),
      });

      const data = await res.json();

      if (data.ok) {
        await fetchData();
      }

      return data;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '追加エラー' };
    }
  }, [fetchData]);

  // ---------------------------------------------------------
  // 書類からページ削除（v3.1追加）
  // ---------------------------------------------------------
  const removePageFromDocument = useCallback(async (documentId: number, pageNumber: number) => {
    // ページ番号からページIDを取得
    const page = pages.find((p) => p.page_number === pageNumber);
    if (!page) {
      return { ok: false, error: 'ページが見つかりません' };
    }

    try {
      const res = await fetch(`/api/cm/fax/documents/${documentId}/pages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ page_ids: [page.id] }),
      });

      const data = await res.json();

      if (data.ok) {
        await fetchData();
      }

      return data;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '削除エラー' };
    }
  }, [pages, fetchData]);

  // ---------------------------------------------------------
  // 事業所検索（既存APIに合わせたパス）
  // ---------------------------------------------------------
  const searchOffices = useCallback(async (query: string) => {
    if (query.length < 2) {
      setOfficeSearchResults([]);
      return;
    }

    try {
      // 既存API: /api/cm/fax/offices
      const res = await fetch(`/api/cm/fax/offices?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      });

      const data = await res.json();

      if (data.ok) {
        // 既存APIのレスポンス形式に対応
        const results: CmOfficeSearchResult[] = (data.offices || []).map((o: {
          id: number;
          office_name: string;
          fax_number?: string;
          fax?: string;
          fax_proxy?: string;
          service_type?: string;
          prefecture?: string;
        }) => ({
          id: o.id,
          office_name: o.office_name,
          fax: o.fax_number || o.fax || null,
          fax_proxy: o.fax_proxy || null,
          service_type: o.service_type || null,
          prefecture: o.prefecture || null,
        }));
        setOfficeSearchResults(results);
      }
    } catch (e) {
      console.error('事業所検索エラー:', e);
    }
  }, []);

  // ---------------------------------------------------------
  // 事業所追加
  // ---------------------------------------------------------
  const addOffice = useCallback(async (officeId: number, registerFaxProxy: boolean) => {
    try {
      const res = await fetch(`/api/cm/fax/${faxId}/offices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          office_id: officeId,
          register_fax_proxy: registerFaxProxy,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        await fetchData();
      }

      return data;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '追加エラー' };
    }
  }, [faxId, fetchData]);

  // ---------------------------------------------------------
  // Return
  // ---------------------------------------------------------
  return {
    // データ
    fax,
    pages,
    offices,
    documents,
    clients,
    documentTypes,
    processingStatus,
    loading,
    error,

    // ページ操作
    currentPage,
    currentPageData,
    pageOrder,
    setPageOrder, // v3.1追加: ドラッグ&ドロップ用
    goToPage,
    goToNextUnassigned,
    reversePageOrder,
    zoom,
    setZoom,
    rotation,
    setRotation,

    // 選択状態
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

    // フィルター
    selectedOfficeFilter,
    setSelectedOfficeFilter,
    clientSearch,
    setClientSearch,
    filteredClients,

    // AI推定
    getCurrentPageSuggestion,
    applySuggestion,

    // 書類操作
    saveDocument,
    addPagesToDocument,
    removePageFromDocument, // v3.1追加: 書類からページ削除

    // 事業所操作
    officeSearchQuery,
    setOfficeSearchQuery,
    officeSearchResults,
    searchOffices,
    addOffice,

    // アクション
    refresh: fetchData,
  };
}