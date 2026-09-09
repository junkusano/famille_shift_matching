// =============================================================
// src/app/cm-portal/clients/[id]/consent/page.tsx
// 電子契約同意フォーム画面（Server Component）
//
// Server Component page → lib関数でデータ取得 → Client Component
// =============================================================

import { getClientDetail } from '@/lib/cm/clients/getClientDetail';
import { CmConsentFormPageContent } from '@/components/cm-components/contracts/CmConsentFormPageContent';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CmConsentPage({ params }: Props) {
  const { id: kaipokeCsId } = await params;

  // Server側でデータ取得
  const result = await getClientDetail(kaipokeCsId);

  // エラー時
  if (result.ok === false) {
    return (
      <div className="space-y-6">
        <Link
          href={`/cm-portal/clients/${kaipokeCsId}?tab=contracts`}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          契約一覧に戻る
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {result.error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/cm-portal/clients/${kaipokeCsId}?tab=contracts`}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" />
        契約一覧に戻る
      </Link>

      <CmConsentFormPageContent
        kaipokeCsId={kaipokeCsId}
        clientName={result.client.name}
        clientAddress={[
          result.client.postal_code ? `〒${result.client.postal_code}` : null,
          result.client.prefecture,
          result.client.city,
          result.client.town,
          result.client.building,
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </div>
  );
}
