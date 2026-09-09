// =============================================================
// src/app/cm-portal/service-credentials/page.tsx
// サービス認証情報管理画面（Server Component）
// =============================================================

import { getServiceCredentials } from '@/lib/cm/service-credentials/getServiceCredentials';
import { CmServiceCredentialsPageContent } from '@/components/cm-components/service-credentials/CmServiceCredentialsPageContent';

type Props = {
  searchParams: Promise<{
    serviceName?: string;
    showInactive?: string;
  }>;
};

export default async function CmServiceCredentialsPage({ searchParams }: Props) {
  const params = await searchParams;

  const serviceName = params.serviceName || '';
  const showInactive = params.showInactive === 'true';

  // Server側でデータ取得
  const result = await getServiceCredentials({
    serviceName,
    showInactive,
  });

  // エラー時
  if (result.ok === false){
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">サービス認証情報</h1>
        <p className="text-red-500 mt-4">{'error' in result ? result.error : 'エラーが発生しました'}</p>
      </div>
    );
  }

  // 成功時（ここでは result.ok === true が保証される）
  const { entries } = result;

  return (
    <CmServiceCredentialsPageContent
      entries={entries}
      initialFilters={{
        serviceName,
        showInactive,
      }}
    />
  );
}