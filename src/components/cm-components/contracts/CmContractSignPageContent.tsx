// =============================================================
// src/components/cm-components/contracts/CmContractSignPageContent.tsx
// 署名開始画面 - コンテンツ
//
// 本人確認情報の入力 → 契約ステータスを signing に更新
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { useRouter } from 'next/navigation';
import { getContractDetail } from '@/lib/cm/contracts/getContractDetail';
import {
  updateContract,
  getVerificationMethods,
  getVerificationDocuments,
} from '@/lib/cm/contracts/actions';
import type {
  CmContractDetailData,
  CmVerificationMethod,
  CmVerificationDocument,
} from '@/types/cm/contract';

// =============================================================
// Types
// =============================================================

type Props = {
  kaipokeCsId: string;
  contractId: string;
};

// =============================================================
// Component
// =============================================================

export function CmContractSignPageContent({ kaipokeCsId, contractId }: Props) {
  const router = useRouter();

  // データ
  const [contractData, setContractData] = useState<CmContractDetailData | null>(null);
  const [methods, setMethods] = useState<CmVerificationMethod[]>([]);
  const [verDocs, setVerDocs] = useState<CmVerificationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フォーム
  const [selectedMethodId, setSelectedMethodId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [docOther, setDocOther] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [contractResult, methodsResult, docsResult] = await Promise.all([
        getContractDetail(contractId),
        getVerificationMethods(),
        getVerificationDocuments(),
      ]);

      if (contractResult.ok === true) {
        setContractData(contractResult.data);
      } else {
        setError(contractResult.error || 'データの取得に失敗しました');
        return;
      }

      if (methodsResult.ok === true && methodsResult.data) {
        setMethods(methodsResult.data);
      }
      if (docsResult.ok === true && docsResult.data) {
        setVerDocs(docsResult.data);
      }
    } catch {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------
  // 署名開始処理
  // ---------------------------------------------------------
  const handleStartSigning = async () => {
    if (!selectedMethodId || !selectedDocId) {
      setError('本人確認方法と確認書類を選択してください');
      return;
    }

    const selectedDoc = verDocs.find((d) => d.id === selectedDocId);
    if (selectedDoc?.code === 'other' && !docOther.trim()) {
      setError('書類名を入力してください');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const result = await updateContract({
        contractId,
        status: 'signing',
        verification_method_id: selectedMethodId,
        verification_document_id: selectedDocId,
        verification_document_other:
          selectedDoc?.code === 'other' ? docOther.trim() : null,
        verification_at: new Date().toISOString(),
      });

      if (result.ok === true) {
        router.push(`/cm-portal/clients/${kaipokeCsId}/contracts/${contractId}`);
      } else {
        setError(result.error || '署名開始に失敗しました');
      }
    } catch {
      setError('署名開始に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------
  // ローディング / エラー
  // ---------------------------------------------------------
  if (loading) {
    return (
      <CmCard>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          <span className="ml-2 text-slate-500">読み込み中...</span>
        </div>
      </CmCard>
    );
  }

  if (!contractData) {
    return (
      <CmCard>
        <div className="flex items-center gap-2 text-red-600 py-8 justify-center">
          <AlertCircle className="w-5 h-5" />
          <span>契約情報が見つかりません</span>
        </div>
      </CmCard>
    );
  }

  const hasConsent = !!contractData.consent;

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-800">署名開始</h2>

      {/* 同意未取得警告 */}
      {!hasConsent && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              電子契約の同意が取得されていません
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              同意なしでも署名を開始できますが、事前の同意取得を推奨します。
            </p>
          </div>
        </div>
      )}

      {hasConsent && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700">電子契約の同意取得済み</p>
        </div>
      )}

      {/* 本人確認情報入力 */}
      <CmCard title="本人確認情報">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              確認方法 <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedMethodId}
              onChange={(e) => setSelectedMethodId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">選択してください</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              確認書類 <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">選択してください</option>
              {verDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {verDocs.find((d) => d.id === selectedDocId)?.code === 'other' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                書類名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={docOther}
                onChange={(e) => setDocOther(e.target.value)}
                placeholder="確認書類名を入力"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}
        </div>
      </CmCard>

      {/* エラー */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* 送信ボタン */}
      <div className="flex justify-end">
        <button
          onClick={handleStartSigning}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              処理中...
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              署名を開始する
            </>
          )}
        </button>
      </div>
    </div>
  );
}