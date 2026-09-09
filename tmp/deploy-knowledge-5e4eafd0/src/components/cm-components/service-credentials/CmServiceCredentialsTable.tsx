// =============================================================
// src/components/cm-components/service-credentials/CmServiceCredentialsTable.tsx
// サービス認証情報 - テーブル
// =============================================================

'use client';

import React from 'react';
import {
  Key,
  AlertCircle,
  Pencil,
  Trash2,
  Loader2,
  X,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import type { CmServiceCredentialMasked } from '@/types/cm/serviceCredentials';

type Props = {
  entries: CmServiceCredentialMasked[];
  loading: boolean;
  error: string | null;
  updateError: string | null;
  onEdit: (entry: CmServiceCredentialMasked) => void;
  onDelete: (entry: CmServiceCredentialMasked) => void;
  onClearUpdateError: () => void;
};

export function CmServiceCredentialsTable({
  entries,
  loading,
  error,
  updateError,
  onEdit,
  onDelete,
  onClearUpdateError,
}: Props) {
  // エラー表示
  const renderError = () => {
    if (!error && !updateError) return null;

    return (
      <div className="mb-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}
        {updateError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {updateError}
            </div>
            <button
              onClick={onClearUpdateError}
              className="text-amber-600 hover:text-amber-800 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ローディング表示
  if (loading) {
    return (
      <>
        {renderError()}
        <CmCard noPadding>
          <div className="p-8 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            読み込み中...
          </div>
        </CmCard>
      </>
    );
  }

  // 空状態
  if (entries.length === 0) {
    return (
      <>
        {renderError()}
        <CmCard noPadding>
          <div className="p-8 text-center">
            <Key className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">登録されたサービス認証情報がありません</p>
            <p className="text-sm text-slate-400 mt-1">
              「新規登録」ボタンから追加してください
            </p>
          </div>
        </CmCard>
      </>
    );
  }

  return (
    <>
      {renderError()}
      <CmCard noPadding>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  サービス名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  ラベル
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  認証情報
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  状態
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={`hover:bg-slate-50 transition-colors ${
                    !entry.is_active ? 'bg-slate-50/50 opacity-70' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800 font-mono">
                      {entry.service_name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {entry.label || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {entry.credentials_keys.map((key) => (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500 font-medium">{key}:</span>
                          <span className="text-slate-400 font-mono">
                            {entry.credentials_masked[key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {entry.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3" />
                        有効
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                        <XCircle className="w-3 h-3" />
                        無効
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEdit(entry)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                        title="編集"
                      >
                        <Pencil className="w-3 h-3" />
                        編集
                      </button>
                      <button
                        onClick={() => onDelete(entry)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                        title="削除"
                      >
                        <Trash2 className="w-3 h-3" />
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CmCard>
    </>
  );
}
