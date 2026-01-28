// =============================================================
// src/app/cm-portal/clients/[id]/page.tsx
// 利用者詳細画面（Server Component）
// =============================================================

import { getClientDetail } from '@/lib/cm/clients/getClientDetail';
import { CmClientDetailPageContent } from '@/components/cm-components/clients/CmClientDetailPageContent';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function CmClientDetailPage({ params, searchParams }: Props) {
  const { id: kaipokeCsId } = await params;
  const { tab } = await searchParams;

  // Server側でデータ取得
  const result = await getClientDetail(kaipokeCsId);

  // エラー時
  if (result.ok === false) {
    return (
      <div className="space-y-6">
        <Link
          href="/cm-portal/clients"
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          一覧に戻る
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {result.error}
        </div>
      </div>
    );
  }

  return (
    <CmClientDetailPageContent
      client={result.client}
      initialTab={tab || 'basic'}
    />
  );
}