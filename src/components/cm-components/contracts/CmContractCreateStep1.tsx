// =============================================================
// src/components/cm-components/contracts/CmContractCreateStep1.tsx
// 契約作成ウィザード Step1 - 書類選択
// =============================================================

'use client';

import React from 'react';
import { FileText, Check } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { CONTRACT_DOCUMENT_TEMPLATES } from '@/lib/cm/contracts/templates';
import type { CmContractCreateStep1Data } from '@/types/cm/contractCreate';
import type { CmContractTemplateCode } from '@/types/cm/contractTemplate';

// =============================================================
// Types
// =============================================================

type Props = {
  data: CmContractCreateStep1Data;
  onChange: (data: CmContractCreateStep1Data) => void;
  onNext: () => void;
  onCancel: () => void;
};

// =============================================================
// Component
// =============================================================

export function CmContractCreateStep1({ data, onChange, onNext, onCancel }: Props) {
  const templates = CONTRACT_DOCUMENT_TEMPLATES;

  // ---------------------------------------------------------
  // 書類選択ハンドラ
  // ---------------------------------------------------------
  const handleToggle = (code: CmContractTemplateCode) => {
    const template = templates.find((t) => t.code === code);
    
    // 必須書類は解除不可
    if (template?.isRequired) return;

    const current = data.selectedTemplates;
    const isSelected = current.includes(code);

    const newSelected = isSelected
      ? current.filter((c) => c !== code)
      : [...current, code];

    onChange({ selectedTemplates: newSelected });
  };

  // ---------------------------------------------------------
  // バリデーション
  // ---------------------------------------------------------
  const isValid = data.selectedTemplates.length > 0;

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ステップインジケーター */}
      <StepIndicator current={1} />

      {/* 書類選択カード */}
      <CmCard
        title="作成する書類を選択"
        footer={
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!isValid}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              次へ →
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-500 mb-6">
          必要な書類にチェックを入れてください。必須マークの書類は自動的に選択されます。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => {
            const isSelected = data.selectedTemplates.includes(template.code);

            return (
              <div
                key={template.code}
                onClick={() => handleToggle(template.code)}
                className={`
                  relative border-2 rounded-lg p-4 cursor-pointer transition-all
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }
                  ${template.isRequired ? 'cursor-default' : ''}
                `}
              >
                <div className="flex items-start gap-3">
                  {/* チェックボックス */}
                  <div
                    className={`
                      w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5
                      ${isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-slate-300 bg-white'
                      }
                    `}
                  >
                    {isSelected && <Check className="w-4 h-4 text-white" />}
                  </div>

                  {/* 書類情報 */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="font-medium text-slate-800">
                        {template.name}
                      </span>
                      {template.isRequired && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">
                          必須
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 選択数表示 */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="text-sm text-slate-500">
            選択中: <span className="font-medium text-slate-700">{data.selectedTemplates.length}</span> 点
          </p>
        </div>
      </CmCard>
    </div>
  );
}

// =============================================================
// ステップインジケーター
// =============================================================

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { num: 1, label: '書類選択' },
    { num: 2, label: '情報確認' },
    { num: 3, label: 'PDF生成' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between max-w-md mx-auto">
        {steps.map((step, i) => (
          <React.Fragment key={step.num}>
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm
                  ${current > step.num
                    ? 'bg-green-500 text-white'
                    : current === step.num
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                  }
                `}
              >
                {current > step.num ? '✓' : step.num}
              </div>
              <div
                className={`text-xs mt-2 ${
                  current === step.num ? 'text-blue-600 font-medium' : 'text-slate-500'
                }`}
              >
                {step.label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-3 ${
                  current > step.num ? 'bg-green-500' : 'bg-slate-200'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export { StepIndicator };