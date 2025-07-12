import React from 'react';
import { OrgIconsPanel } from '@/components/OrgIconManager';
import { useUserRole } from '@/context/RoleContext'

const role = useUserRole();

export default function OrgIconsPage() {

  if (!['admin', 'manager'].includes(role)) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>
  }

  return (
    <main className="p-4">
      <h1 className="text-xl font-bold mb-4">組織アイコン管理</h1>
      <OrgIconsPanel />
    </main>
  );
}