// =============================================================
// src/components/cm-components/fax/CmFaxClientSelector.tsx
// FAX詳細 - 利用者選択
// =============================================================

'use client';

import React from 'react';
import { User, Search, Building2, Sparkles, Star, X, Check } from 'lucide-react';
import type {
  CmClientCandidate,
  CmFaxReceivedOffice,
  CmSelectedClient,
  CmPageSuggestion,
} from '@/types/cm/faxDetail';

type Props = {
  clients: CmClientCandidate[];
  selectedClients: CmSelectedClient[];
  offices: CmFaxReceivedOffice[];
  selectedOfficeFilter: number | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOfficeFilterChange: (officeId: number | null) => void;
  onToggleClient: (client: CmClientCandidate) => void;
  onClearAll: () => void;
  onSetPrimary: (kaipokeCSId: string) => void;
  suggestion?: CmPageSuggestion | null;
  disabled?: boolean;
};

export function CmFaxClientSelector({
  clients,
  selectedClients,
  offices,
  selectedOfficeFilter,
  searchQuery,
  onSearchChange,
  onOfficeFilterChange,
  onToggleClient,
  onClearAll,
  onSetPrimary,
  suggestion,
  disabled = false,
}: Props) {
  const suggestedClientIds = suggestion?.clients?.map((c) => c.kaipoke_cs_id) ?? [];
  const selectedClientIds = new Set(selectedClients.map((c) => c.kaipokeCSId));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">利用者</span>
          {suggestedClientIds.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <Sparkles className="w-3 h-3" />
              AI推定あり
            </span>
          )}
        </div>
        {selectedClients.length > 0 && (
          <button
            onClick={onClearAll}
            disabled={disabled}
            className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            選択解除
          </button>
        )}
      </div>

      {selectedClients.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-blue-50 rounded-lg border border-blue-100">
          {selectedClients.map((client) => (
            <div
              key={client.kaipokeCSId}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-sm ${
                client.isPrimary
                  ? 'bg-blue-200 text-blue-900'
                  : 'bg-white text-blue-800 border border-blue-200'
              }`}
            >
              {client.isPrimary && <Star className="w-3 h-3 fill-current" />}
              <span>{client.name}</span>
              {!client.isPrimary && (
                <button
                  onClick={() => onSetPrimary(client.kaipokeCSId)}
                  disabled={disabled}
                  className="ml-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  title="主利用者に設定"
                >
                  <Star className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => {
                  const candidate = clients.find((c) => c.kaipoke_cs_id === client.kaipokeCSId);
                  if (candidate) onToggleClient(candidate);
                }}
                disabled={disabled}
                className="ml-1 text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {offices.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onOfficeFilterChange(null)}
            disabled={disabled}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${
              selectedOfficeFilter === null
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
            }`}
          >
            すべて
          </button>
          {offices.map((office) => (
            <button
              key={office.office_id}
              onClick={() => onOfficeFilterChange(office.office_id)}
              disabled={disabled}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              } ${
                selectedOfficeFilter === office.office_id
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
              }`}
            >
              <Building2 className="w-3 h-3" />
              {office.office_name}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="名前・カナで検索..."
          disabled={disabled}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:opacity-50"
        />
      </div>

      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {clients.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">利用者が見つかりません</div>
        ) : (
          clients.map((client) => {
            const isSelected = selectedClientIds.has(client.kaipoke_cs_id);
            const isSuggested = suggestedClientIds.includes(client.kaipoke_cs_id);
            const confidence = suggestion?.clients?.find(
              (c) => c.kaipoke_cs_id === client.kaipoke_cs_id
            )?.confidence;

            return (
              <button
                key={client.kaipoke_cs_id}
                onClick={() => onToggleClient(client)}
                disabled={disabled}
                className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                  disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isSelected
                    ? 'bg-blue-50'
                    : isSuggested
                      ? 'bg-amber-50 hover:bg-amber-100'
                      : 'hover:bg-slate-50'
                }`}
              >
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isSuggested && <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                    <span className="font-medium text-slate-900 truncate">{client.client_name}</span>
                    {confidence !== undefined && (
                      <span className="text-xs text-amber-600">{Math.round(confidence * 100)}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{client.client_kana}</span>
                    {offices.length > 1 && (
                      <>
                        <span>·</span>
                        <span>{client.office_name}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {clients.length > 0 && (
        <div className="text-xs text-slate-500 text-right">{clients.length}件の利用者</div>
      )}
    </div>
  );
}
