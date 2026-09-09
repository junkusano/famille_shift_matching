// =============================================================
// src/components/cm-components/fax/CmFaxOfficeModal.tsx
// FAX詳細 - 事業所追加モーダル
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Building2, Phone, MapPin, AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { CmOfficeSearchResult } from '@/types/cm/faxDetail';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  faxNumber: string;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchResults: CmOfficeSearchResult[];
  isSearching: boolean;
  onSearch: (query: string) => Promise<void>;
  onConfirm: (officeId: number, registerFaxProxy: boolean) => Promise<void>;
};

export function CmFaxOfficeModal({
  isOpen,
  onClose,
  faxNumber,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  isSearching,
  onSearch,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<'search' | 'confirm'>('search');
  const [selectedOffice, setSelectedOffice] = useState<CmOfficeSearchResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) return;

    const timer = setTimeout(() => {
      onSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, onSearch]);

  const handleClose = useCallback(() => {
    setStep('search');
    setSelectedOffice(null);
    onClose();
  }, [onClose]);

  const handleConfirm = useCallback(
    async (officeId: number, registerFaxProxy: boolean) => {
      setIsSubmitting(true);
      try {
        await onConfirm(officeId, registerFaxProxy);
        handleClose();
      } catch (error) {
        console.error('事業所追加エラー:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [onConfirm, handleClose]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleSelectOffice = useCallback(
    (office: CmOfficeSearchResult) => {
      setSelectedOffice(office);
      const faxMatches = office.fax === faxNumber || office.fax_proxy === faxNumber;

      if (faxMatches) {
        handleConfirm(office.id, false);
      } else {
        setStep('confirm');
      }
    },
    [faxNumber]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">
              {step === 'search' ? '事業所を追加' : 'FAX番号の確認'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 'search' ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder="事業所名またはFAX番号で検索..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                )}
              </div>

              {searchQuery.length >= 2 && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {searchResults.length === 0 && !isSearching ? (
                    <div className="p-4 text-center text-sm text-slate-500">
                      該当する事業所が見つかりません
                    </div>
                  ) : (
                    searchResults.map((office) => (
                      <button
                        key={office.id}
                        onClick={() => handleSelectOffice(office)}
                        className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
                      >
                        <Building2 className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900">{office.office_name}</div>
                          {office.fax && (
                            <div className="flex items-center gap-1 text-sm text-slate-600 mt-0.5">
                              <Phone className="w-3.5 h-3.5" />
                              <span>FAX: {office.fax}</span>
                            </div>
                          )}
                          {office.prefecture && (
                            <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                              <MapPin className="w-3 h-3" />
                              <span>{office.prefecture}</span>
                              {office.service_type && (
                                <>
                                  <span>·</span>
                                  <span>{office.service_type}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {searchQuery.length < 2 && (
                <p className="text-sm text-slate-500 text-center">
                  2文字以上入力すると検索が開始されます
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">FAX番号が一致しません</p>
                  <p className="text-sm text-amber-700 mt-1">
                    受信したFAX番号と選択した事業所のFAX番号が異なります。
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">受信FAX番号</span>
                  <span className="font-mono text-slate-900">{faxNumber}</span>
                </div>
                <div className="border-t border-slate-200" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">事業所名</span>
                  <span className="font-medium text-slate-900">{selectedOffice?.office_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">登録FAX番号</span>
                  <span className="font-mono text-slate-900">{selectedOffice?.fax || '未登録'}</span>
                </div>
                {selectedOffice?.fax_proxy && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">代理FAX番号</span>
                    <span className="font-mono text-slate-900">{selectedOffice.fax_proxy}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleConfirm(selectedOffice!.id, true)}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-between p-4 rounded-lg border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-left">
                    <div className="font-medium text-blue-900">代理FAX番号として登録</div>
                    <div className="text-sm text-blue-700 mt-0.5">
                      今後この番号からのFAXも自動で紐付けます
                    </div>
                  </div>
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : (
                    <Check className="w-5 h-5 text-blue-600" />
                  )}
                </button>

                <button
                  onClick={() => handleConfirm(selectedOffice!.id, false)}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-between p-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-left">
                    <div className="font-medium text-slate-900">今回だけ紐付け</div>
                    <div className="text-sm text-slate-600 mt-0.5">
                      FAX番号は登録せず、この1回だけ紐付けます
                    </div>
                  </div>
                </button>
              </div>

              <button
                onClick={() => setStep('search')}
                disabled={isSubmitting}
                className="w-full py-2 text-sm text-slate-600 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← 事業所を選び直す
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}