// =============================================================
// src/components/cm-components/local-fax-phonebook/CmSyncResultModal.tsx
// ローカルFAX電話帳 - 同期結果モーダル
// =============================================================

'use client';

import React from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import type { CmLocalFaxPhonebookSyncResult } from '@/types/cm/localFaxPhonebook';

type Props = {
  isOpen: boolean;
  result: CmLocalFaxPhonebookSyncResult | null;
  onClose: () => void;
};

export function CmSyncResultModal({ isOpen, result, onClose }: Props) {
  if (!isOpen || !result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* モーダル */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">同期結果</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 本文 */}
        <div className="px-6 py-4">
          {/* ステータス */}
          {result.ok ? (
            <div className="flex items-center gap-2 text-green-700 mb-4">
              <Check className="w-5 h-5" />
              <span className="font-medium">同期が完了しました</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700 mb-4">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">同期中にエラーが発生しました</span>
            </div>
          )}

          {/* サマリー */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-700">
                {result.summary.xmlOnly}
              </div>
              <div className="text-sm text-blue-600">XMLからDBに追加</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-700">
                {result.summary.dbOnly}
              </div>
              <div className="text-sm text-green-600">DBからXMLに追加</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <div className="text-2xl font-bold text-amber-700">
                {result.summary.different}
              </div>
              <div className="text-sm text-amber-600">差分更新</div>
            </div>
            <div className="p-3 bg-slate-100 rounded-lg">
              <div className="text-2xl font-bold text-slate-700">
                {result.summary.duration.toFixed(1)}s
              </div>
              <div className="text-sm text-slate-600">処理時間</div>
            </div>
          </div>

          {/* ログ */}
          {result.log && result.log.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">ログ</h3>
              <div className="max-h-40 overflow-y-auto bg-slate-900 rounded-lg p-3">
                {result.log.map((line, index) => (
                  <div
                    key={index}
                    className="text-xs text-slate-300 font-mono"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* エラーメッセージ */}
          {result.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm text-red-700">{result.error}</div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-sm font-medium"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
