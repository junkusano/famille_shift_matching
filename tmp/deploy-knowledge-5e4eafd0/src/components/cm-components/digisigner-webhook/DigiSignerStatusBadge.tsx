// =============================================================
// src/components/cm-components/digisigner-webhook/DigiSignerStatusBadge.tsx
// DigiSigner Webhookログ - ステータスバッジ
// =============================================================

"use client";

import React from "react";

export function DigiSignerStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    received: "bg-amber-100 text-amber-700",
    processed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    rejected: "bg-pink-100 text-pink-700",
  };
  const style = styles[status] || "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
