// =============================================================
// src/app/cm-portal/audit/flow/page.tsx
// 経路フローページ — Server Component
// 操作の因果関係をセッション単位で可視化
// =============================================================

import { Suspense } from 'react';
import { CmAuditFlowPage } from '@/components/cm-components/audit/CmAuditFlowPage';

export default function CmAuditFlowPageRoute() {
  return (
    <Suspense>
      <CmAuditFlowPage />
    </Suspense>
  );
}
