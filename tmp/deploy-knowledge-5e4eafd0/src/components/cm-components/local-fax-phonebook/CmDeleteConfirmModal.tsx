// =============================================================
// src/components/cm-components/local-fax-phonebook/CmDeleteConfirmModal.tsx
// ローカルFAX電話帳 - 削除確認モーダル
// =============================================================

'use client';

import React from 'react';
import { AlertCircle, Trash2, Loader2 } from 'lucide-react';
import type { CmLocalFaxPhonebookEntry } from '@/types/cm/localFaxPhonebook';

type Props = {
  isOpen: boolean;
  entry: CmLocalFaxPhonebookEntry | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
};

export function CmDeleteConfirmModal({
  isOpen,
  entry,
  onClose,
  onConfirm,
  isDeleting,
}: Props) {
  if (!isOpen || !entry) return null;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* モーダル */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">削除確認</h2>
        </div>

        {/* 本文 */}
        <div className="px-6 py-4">
          <p className="text-slate-600">
            以下のエントリを削除してもよろしいですか？
          </p>

          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <div className="text-sm">
              <span className="text-slate-500">事業所名: </span>
              <span className="font-medium text-slate-800">{entry.name}</span>
            </div>
            {entry.fax_number && (
              <div className="text-sm mt-1">
                <span className="text-slate-500">FAX番号: </span>
                <span className="font-mono text-slate-800">{entry.fax_number}</span>
              </div>
            )}
            {entry.source_id && (
              <div className="text-sm mt-1">
                <span className="text-slate-500">ID: </span>
                <span className="font-mono text-slate-600">{entry.source_id}</span>
              </div>
            )}
          </div>

          <p className="mt-4 text-sm text-amber-600 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            この操作はXMLからも削除され、元に戻せません。
          </p>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-white transition-colors text-sm font-medium disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                削除中...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                削除
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
