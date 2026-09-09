// =============================================================
// src/app/cm-portal/audit/operations/page.tsx
// 操作ログ一覧ページ — Server Component
// ユーザー操作・DB変更をフィルター検索
// =============================================================

import { Suspense } from 'react';
import { CmAuditOperationsPage } from '@/components/cm-components/audit/CmAuditOperationsPage';

export default function CmAuditOperationsPageRoute() {
  return (
    <Suspense>
      <CmAuditOperationsPage />
    </Suspense>
  );
}