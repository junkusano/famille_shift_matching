// =============================================================
// src/app/cm-portal/clients/[id]/contracts/create/page.tsx
// 契約作成ページ
// =============================================================

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { CmContractCreateWizard } from '@/components/cm-components/contracts/CmContractCreateWizard';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ContractCreatePage({ params }: Props) {
  const { id: kaipokeCsId } = await params;

  return (
    <div className="space-y-6">
      <Link
        href={`/cm-portal/clients/${kaipokeCsId}?tab=contracts`}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" />
        契約一覧に戻る
      </Link>

      <CmContractCreateWizard kaipokeCsId={kaipokeCsId} />
    </div>
  );
}