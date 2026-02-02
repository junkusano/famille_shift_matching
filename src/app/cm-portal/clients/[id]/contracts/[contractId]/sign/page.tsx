// =============================================================
// src/app/cm-portal/clients/[id]/contracts/[contractId]/sign/page.tsx
// 署名開始画面（Server Component）
// =============================================================

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { CmContractSignPageContent } from '@/components/cm-components/contracts/CmContractSignPageContent';

type Props = {
  params: Promise<{ id: string; contractId: string }>;
};

export default async function CmContractSignPage({ params }: Props) {
  const { id: kaipokeCsId, contractId } = await params;

  return (
    <div className="space-y-6">
      <Link
        href={`/cm-portal/clients/${kaipokeCsId}?tab=contracts`}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" />
        契約一覧に戻る
      </Link>

      <CmContractSignPageContent
        kaipokeCsId={kaipokeCsId}
        contractId={contractId}
      />
    </div>
  );
}
