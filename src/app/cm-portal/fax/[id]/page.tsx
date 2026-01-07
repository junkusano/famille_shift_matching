// =============================================================
// src/app/cm-portal/fax/[id]/page.tsx
// FAX詳細画面
// =============================================================

'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { CmFaxDetailView } from '@/components/cm-components/fax/CmFaxDetailView';

export default function CmFaxDetailPage() {
  const params = useParams();
  const faxId = parseInt(params.id as string, 10);

  if (isNaN(faxId)) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500">無効なFAX IDです</p>
        </div>
      </div>
    );
  }

  return <CmFaxDetailView faxId={faxId} />;
}
