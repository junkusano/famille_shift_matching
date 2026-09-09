// =============================================================
// src/components/cm-components/fax/CmFaxDocTypeSelector.tsx
// FAX詳細 - 文書種別選択
// =============================================================

'use client';

import React, { useMemo } from 'react';
import { FileType, Sparkles, Megaphone, AlertTriangle } from 'lucide-react';
import type { CmDocumentType, CmPageSuggestion } from '@/types/cm/faxDetail';

type Props = {
  documentTypes: CmDocumentType[];
  selectedDocType: number | null;
  onSelect: (id: number | null) => void;
  suggestion?: CmPageSuggestion | null;
  disabled?: boolean;
};

const ADVERTISEMENT_DOC_TYPE_ID = 8;

const CATEGORY_ORDER: Record<string, number> = {
  'サービス': 1,
  '計画': 2,
  'アセスメント': 3,
  '連絡': 4,
  'その他': 99,
};

export function CmFaxDocTypeSelector({
  documentTypes,
  selectedDocType,
  onSelect,
  suggestion,
  disabled = false,
}: Props) {
  const groupedDocTypes = useMemo(() => {
    const groups: Record<string, CmDocumentType[]> = {};

    documentTypes.forEach((docType) => {
      const category = docType.category || 'その他';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(docType);
    });

    const sortedCategories = Object.keys(groups).sort((a, b) => {
      const orderA = CATEGORY_ORDER[a] ?? 50;
      const orderB = CATEGORY_ORDER[b] ?? 50;
      return orderA - orderB;
    });

    return sortedCategories.map((category) => ({
      category,
      items: groups[category].sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [documentTypes]);

  const suggestedDocTypeId = suggestion?.docType?.id ?? null;
  const isAdvertisementSelected = selectedDocType === ADVERTISEMENT_DOC_TYPE_ID;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileType className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-700">文書種別</span>
        {suggestedDocTypeId && (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <Sparkles className="w-3 h-3" />
            AI推定あり
          </span>
        )}
      </div>

      <div className="space-y-3">
        {groupedDocTypes.map(({ category, items }) => (
          <div key={category}>
            <div className="text-xs text-slate-500 mb-1.5">{category}</div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((docType) => {
                const isSelected = selectedDocType === docType.id;
                const isSuggested = suggestedDocTypeId === docType.id;
                const isAd = docType.id === ADVERTISEMENT_DOC_TYPE_ID;

                return (
                  <button
                    key={docType.id}
                    onClick={() => onSelect(isSelected ? null : docType.id)}
                    disabled={disabled}
                    className={`relative px-3 py-1.5 text-sm rounded-md border transition-all ${
                      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? isAd
                          ? 'bg-orange-100 border-orange-400 text-orange-800'
                          : 'bg-blue-100 border-blue-400 text-blue-800'
                        : isSuggested
                          ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {isAd && <Megaphone className="w-3 h-3" />}
                      {isSuggested && !isSelected && <Sparkles className="w-3 h-3 text-amber-500" />}
                      {docType.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {isAdvertisementSelected && (
        <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-700">
            <p className="font-medium">広告として処理されます</p>
            <p className="text-xs mt-0.5">利用者の選択は不要です。このページは保存後に非表示となります。</p>
          </div>
        </div>
      )}
    </div>
  );
}
