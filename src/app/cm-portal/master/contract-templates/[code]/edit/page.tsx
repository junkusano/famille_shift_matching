// =============================================================
// src/app/cm-portal/master/contract-templates/[code]/edit/page.tsx
// 契約書テンプレート編集ページ
// =============================================================

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getTemplateByCode } from '@/lib/cm/contracts/templateActions';
import { CmTemplateEditor } from '@/components/cm-components/contracts/CmTemplateEditor';
import type { CmContractTemplateCode } from '@/types/cm/contractTemplate';

type Props = {
  params: Promise<{ code: string }>;
};

export default async function ContractTemplateEditPage({ params }: Props) {
  const { code } = await params;
  
  const result = await getTemplateByCode(code as CmContractTemplateCode);

  if (result.ok === false) {
    return (
      <div className="space-y-6">
        <Link
          href="/cm-portal/master/contract-templates"
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          契約書テンプレートに戻る
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {result.error}
        </div>
      </div>
    );
  }

  if (!result.data) {
    return (
      <div className="space-y-6">
        <Link
          href="/cm-portal/master/contract-templates"
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          契約書テンプレートに戻る
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          テンプレートが見つかりません
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/cm-portal/master/contract-templates"
        className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" />
        契約書テンプレートに戻る
      </Link>

      <CmTemplateEditor template={result.data} />
    </div>
  );
}