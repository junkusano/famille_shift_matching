// =============================================================
// src/app/cm-portal/clients/page.tsx
// 利用者情報一覧画面（Server Component）
// =============================================================

import { getClients } from '@/lib/cm/clients/getClients';
import { CmClientsPageContent } from '@/components/cm-components/clients/CmClientsPageContent';

type Props = {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    insurer?: string;
  }>;
};

export default async function CmClientsPage({ searchParams }: Props) {
  const params = await searchParams;
  
  const page = parseInt(params.page || '1', 10);
  const search = params.search || '';
  const status = params.status || 'active';
  const insurer = params.insurer || '';

  // Server側でデータ取得
  const result = await getClients({
    page,
    search,
    status,
    insurer,
  });

  if (result.ok === false) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">利用者情報一覧</h1>
        <p className="text-red-500 mt-4">{result.error}</p>
      </div>
    );
  }

  return (
    <CmClientsPageContent
      clients={result.clients}
      pagination={result.pagination}
      insurerOptions={result.insurerOptions}
      initialFilters={{
        search,
        status,
        insurer,
      }}
    />
  );
}