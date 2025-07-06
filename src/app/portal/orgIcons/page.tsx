import React from 'react';
import { OrgIconsPanel } from '@/components/OrgIconManager';

export default function OrgIconsPage() {
  return (
    <main className="p-4">
      <h1 className="text-xl font-bold mb-4">組織アイコン管理</h1>
      <OrgIconsPanel />
    </main>
  );
}