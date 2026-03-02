// =============================================================
// src/components/cm-components/digisigner-webhook/EventTypeBadge.tsx
// DigiSigner Webhookログ - イベントタイプバッジ
// =============================================================

"use client";

import React from "react";

export function EventTypeBadge({ eventType }: { eventType: string }) {
  const styles: Record<string, string> = {
    SIGNATURE_REQUEST_COMPLETED: "bg-purple-100 text-purple-700",
    DOCUMENT_SIGNED: "bg-sky-100 text-sky-700",
  };
  const style = styles[eventType] || "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${style}`}
    >
      {eventType}
    </span>
  );
}
