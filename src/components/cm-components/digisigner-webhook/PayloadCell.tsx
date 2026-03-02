// =============================================================
// src/components/cm-components/digisigner-webhook/PayloadCell.tsx
// DigiSigner Webhookログ - ペイロード展開セル
// =============================================================

"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function PayloadCell({ payload }: { payload: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const jsonStr = JSON.stringify(payload, null, 2);
  const preview = JSON.stringify(payload).slice(0, 40) + "...";

  return (
    <div>
      <div className="text-xs text-slate-400 font-mono truncate max-w-[200px]">
        {preview}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-500 hover:text-blue-700 hover:underline mt-0.5 flex items-center gap-0.5"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-3 h-3" />
            閉じる
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" />
            詳細を見る
          </>
        )}
      </button>
      {expanded && (
        <pre className="mt-2 p-3 bg-slate-800 text-slate-200 rounded-lg text-xs font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
          {jsonStr}
        </pre>
      )}
    </div>
  );
}
