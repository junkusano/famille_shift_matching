// =============================================================
// src/app/cm-portal/fax/[id]/page.tsx
// FAX詳細画面
//
// 【v3.1対応】
// - フルスクリーンレイアウト対応（h-screen）
// - CmFaxDetailContent がページ全体を占有
// =============================================================

'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { useCmFaxDetail } from '@/hooks/cm/fax/useCmFaxDetail';
import { CmFaxDetailContent } from '@/components/cm-components/fax/CmFaxDetailContent';

export default function CmFaxDetailPage() {
  const params = useParams();
  const router = useRouter();
  const faxId = parseInt(params.id as string, 10);

  const {
    fax,
    loading,
    error,
    refresh,
    ...rest
  } = useCmFaxDetail(faxId);

  // ---------------------------------------------------------
  // バリデーション
  // ---------------------------------------------------------
  if (isNaN(faxId) || faxId <= 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <button
            onClick={() => router.push('/cm-portal/fax')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            一覧に戻る
          </button>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            無効なFAX IDです
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // ローディング
  // ---------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-teal-400" />
          <span className="text-gray-400 text-sm">読み込み中...</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // エラー
  // ---------------------------------------------------------
  if (error || !fax) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
          <button
            onClick={() => router.push('/cm-portal/fax')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            一覧に戻る
          </button>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error || 'FAXが見つかりません'}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <CmFaxDetailContent
      fax={fax}
      loading={loading}
      onRefresh={refresh}
      {...rest}
    />
  );
}