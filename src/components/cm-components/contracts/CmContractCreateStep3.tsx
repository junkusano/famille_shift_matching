// =============================================================
// src/components/cm-components/contracts/CmContractCreateStep3.tsx
// 契約作成ウィザード Step3 - PDF生成・DigiSigner送信
// =============================================================

'use client';

import React, { useState } from 'react';
import { FileText, Upload, CheckCircle2, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { StepIndicator } from './CmContractCreateStep1';
import { CONTRACT_DOCUMENT_TEMPLATES } from '@/lib/cm/contracts/templates';
import { createContractWithDocuments } from '@/lib/cm/contracts/createContract';
import type {
  CmContractCreateWizardData,
  CmCreateContractResult,
} from '@/types/cm/contractCreate';

// =============================================================
// Types
// =============================================================

type Props = {
  kaipokeCsId: string;
  wizardData: CmContractCreateWizardData;
  onBack: () => void;
  onComplete: () => void;
};

type ProcessingStatus = 'idle' | 'processing' | 'completed' | 'error';

// =============================================================
// Component
// =============================================================

export function CmContractCreateStep3({
  kaipokeCsId,
  wizardData,
  onBack,
  onComplete,
}: Props) {
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CmCreateContractResult | null>(null);

  // ---------------------------------------------------------
  // 選択された書類
  // ---------------------------------------------------------
  const selectedTemplates = wizardData.step1.selectedTemplates.map((code) => {
    const template = CONTRACT_DOCUMENT_TEMPLATES.find((t) => t.code === code);
    return {
      code,
      name: template?.name ?? code,
    };
  });

  // ---------------------------------------------------------
  // PDF生成・送信ハンドラ
  // ---------------------------------------------------------
  const handleGenerate = async () => {
    try {
      setStatus('processing');
      setError(null);

      const response = await createContractWithDocuments({
        kaipokeCsId,
        wizardData,
      });

      if (response.ok === false) {
        setError(response.error);
        setStatus('error');
      } else {
        setResult(response.data);
        setStatus('completed');
      }
    } catch {
      setError('予期せぬエラーが発生しました');
      setStatus('error');
    }
  };

  // ---------------------------------------------------------
  // 完了後の処理
  // ---------------------------------------------------------
  const handleComplete = () => {
    if (result) {
      onComplete();
    }
  };

  // ---------------------------------------------------------
  // 契約日の表示形式
  // ---------------------------------------------------------
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  };

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ステップインジケーター */}
      <StepIndicator current={3} />

      <CmCard
        title="PDF生成・DigiSignerへ送信"
        footer={
          status === 'completed' ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleComplete}
                className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
              >
                契約一覧に戻る
              </button>
            </div>
          ) : (
            <div className="flex justify-between">
              <button
                type="button"
                onClick={onBack}
                disabled={status === 'processing'}
                className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                ← 戻る
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={status === 'processing'}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {status === 'processing' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    PDF生成・DigiSignerに送信
                  </>
                )}
              </button>
            </div>
          )
        }
      >
        <p className="text-sm text-slate-500 mb-6">
          PDFを生成してDigiSignerにアップロードします。署名URLが発行されます。
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左: 作成書類一覧 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">作成書類</h3>
            <div className="space-y-2">
              {selectedTemplates.map((template, i) => (
                <div
                  key={template.code}
                  className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-700">{template.name}</span>
                  </div>
                  {status === 'completed' && result?.documents[i] && (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 右: 情報サマリー & ステータス */}
          <div className="space-y-4">
            {/* 情報サマリー */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h4 className="font-medium text-slate-800 mb-3">契約情報</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">利用者</span>
                  <span className="text-slate-700">{wizardData.step2.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">契約日</span>
                  <span className="text-slate-700">{formatDate(wizardData.step2.contractDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">書類数</span>
                  <span className="text-slate-700">{selectedTemplates.length}点</span>
                </div>
              </div>
            </div>

            {/* エラー表示 */}
            {status === 'error' && error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">エラーが発生しました</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* 処理中 */}
            {status === 'processing' && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-blue-800">処理中...</p>
                  <p className="text-sm text-blue-600">PDF生成・アップロードを実行しています</p>
                </div>
              </div>
            )}

            {/* 完了 */}
            {status === 'completed' && result && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">作成完了</p>
                    <p className="text-sm text-green-600 mt-1">
                      {result.documents.length}点の書類をDigiSignerに送信しました
                    </p>
                  </div>
                </div>

                {/* 署名URL一覧 */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <h4 className="font-medium text-slate-800 mb-3">署名URL</h4>
                  <div className="space-y-2">
                    {result.documents.map((doc) => (
                      <div key={doc.digisignerDocumentId} className="text-sm">
                        <p className="text-slate-600 mb-1">{doc.documentName}</p>
                        <a
                          href={doc.signingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-xs break-all"
                        >
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          {doc.signingUrl}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 次のステップ説明 */}
            {status === 'idle' && (
              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                <div className="font-medium mb-2">次のステップ</div>
                <ol className="list-decimal list-inside space-y-1 text-blue-600">
                  <li>PDFを生成してDigiSignerにアップロード</li>
                  <li>署名URLが発行されます</li>
                  <li>面会時に「署名開始」から署名を取得</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </CmCard>
    </div>
  );
}