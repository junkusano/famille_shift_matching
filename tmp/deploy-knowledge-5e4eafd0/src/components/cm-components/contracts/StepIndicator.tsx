// =============================================================
// src/components/cm-components/contracts/StepIndicator.tsx
// 契約作成ウィザード - ステップインジケーター
// =============================================================

'use client';

import React from 'react';

export function StepIndicator({ current }: { current: number }) {
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
