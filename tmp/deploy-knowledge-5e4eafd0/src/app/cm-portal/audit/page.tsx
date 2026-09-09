// =============================================================
// src/app/cm-portal/audit/page.tsx
// 監査ダッシュボード（ハブ）ページ — Server Component
//
// サマリー表示 + 操作ログ / 経路フロー / システムログへのナビゲーション
//
// 変更履歴:
//   旧: 経路フロー + 一覧のタブ切替式ページ
//   新: ダッシュボード（ハブ）に変更。
//        経路フローは /audit/flow、一覧は /audit/operations に分離。
// =============================================================

import { Suspense } from 'react';
import { CmAuditDashboardPage } from '@/components/cm-components/audit/CmAuditDashboardPage';

export default function CmAuditPage() {
  return (
    <Suspense>
      <CmAuditDashboardPage />
    </Suspense>
  );
}