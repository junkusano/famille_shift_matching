// =============================================================
// src/components/cm-components/digisigner-webhook/CmDigisignerWebhookLogSummaryCards.tsx
// DigiSigner Webhookログのサマリーカード
// =============================================================

"use client";

import React from "react";
import { CmCard } from "@/components/cm-components";
import type { CmDigisignerWebhookLogSummary } from "@/types/cm/digisignerWebhookLogs";

type Props = {
  summary: CmDigisignerWebhookLogSummary;
};

export function CmDigisignerWebhookLogSummaryCards({ summary }: Props) {
  const processedRate =
    summary.total > 0
      ? ((summary.processed / summary.total) * 100).toFixed(1)
      : "0";

  const failedAndRejected = summary.failed + summary.rejected;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 総受信数 */}
      <CmCard>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            総受信数
          </p>
          <p className="text-2xl font-bold text-slate-800 mt-1">
            {summary.total.toLocaleString()}
          </p>
        </div>
      </CmCard>

      {/* 処理済み */}
      <CmCard>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            処理済み
          </p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {summary.processed.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{processedRate}%</p>
        </div>
      </CmCard>

      {/* 受信待ち */}
      <CmCard>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            受信待ち
          </p>
          <p className="text-2xl font-bold text-amber-500 mt-1">
            {summary.received.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            リトライ中の可能性
          </p>
        </div>
      </CmCard>

      {/* 拒否 / 失敗 */}
      <CmCard>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            拒否 / 失敗
          </p>
          <p className="text-2xl font-bold text-red-500 mt-1">
            {failedAndRejected.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            トークン不一致など
          </p>
        </div>
      </CmCard>
    </div>
  );
}
