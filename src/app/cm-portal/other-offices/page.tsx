// =============================================================
// src/app/cm-portal/other-offices/page.tsx
// 他社事業所一覧画面（Server Component）
// =============================================================

import { getOtherOffices } from "@/lib/cm/other-offices/getOtherOffices";
import { CmOtherOfficesPageContent } from "@/components/cm-components/other-offices/CmOtherOfficesPageContent";

type Props = {
  searchParams: Promise<{
    page?: string;
    serviceType?: string;
    officeName?: string;
    officeNumber?: string;
    faxNumber?: string;
  }>;
};

export default async function CmOtherOfficesPage({ searchParams }: Props) {
  const params = await searchParams;

  const page = parseInt(params.page || "1", 10);
  const serviceType = params.serviceType || "";
  const officeName = params.officeName || "";
  const officeNumber = params.officeNumber || "";
  const faxNumber = params.faxNumber || "";

  // Server側でデータ取得
  const result = await getOtherOffices({
    page,
    serviceType,
    officeName,
    officeNumber,
    faxNumber,
  });

  // エラー時
  if (!result.ok) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">他社事業所一覧</h1>
        <p className="text-red-500 mt-4">{result.error}</p>
      </div>
    );
  }

  // 成功時
  const { offices, serviceTypes, pagination } = result;

  return (
    <CmOtherOfficesPageContent
      offices={offices}
      serviceTypeOptions={serviceTypes}
      pagination={pagination}
      initialFilters={{
        serviceType,
        officeName,
        officeNumber,
        faxNumber,
      }}
    />
  );
}