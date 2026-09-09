// =============================================================
// src/components/cm-components/contracts/DocumentDriveLinks.tsx
// 契約詳細 - Google Drive リンク（電子署名済み / 紙契約用）
// =============================================================

'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';

export function DocumentDriveLinks({
  gdriveFileUrl,
  unsignedGdriveFileUrl,
  signedGdriveFileUrl,
}: {
  gdriveFileUrl: string | null;
  unsignedGdriveFileUrl: string | null;
  signedGdriveFileUrl: string | null;
}) {
  // 電子契約の署名済みPDF
  if (gdriveFileUrl) {
    return (
      <a href={gdriveFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
        <ExternalLink className="w-3 h-3" />Drive で開く
      </a>
    );
  }

  // 紙契約
  if (unsignedGdriveFileUrl || signedGdriveFileUrl) {
    return (
      <div className="space-y-1">
        {unsignedGdriveFileUrl && (
          <a href={unsignedGdriveFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
            <ExternalLink className="w-3 h-3" />未署名PDF
          </a>
        )}
        {signedGdriveFileUrl && (
          <a href={signedGdriveFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs">
            <ExternalLink className="w-3 h-3" />署名済PDF
          </a>
        )}
      </div>
    );
  }

  return <span className="text-slate-400 text-xs">\u2014</span>;
}
