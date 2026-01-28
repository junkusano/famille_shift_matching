// =============================================================
// src/app/cm-portal/local-fax-phonebook/page.tsx
// ローカルFAX電話帳管理画面（Server Component）
// =============================================================

import { getLocalFaxPhonebook } from "@/lib/cm/local-fax-phonebook/getLocalFaxPhonebook";
import { CmLocalFaxPhonebookPageContent } from "@/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookPageContent";

type Props = {
  searchParams: Promise<{
    page?: string;
    name?: string;
    faxNumber?: string;
    showInactive?: string;
  }>;
};

export default async function CmLocalFaxPhonebookPage({ searchParams }: Props) {
  const params = await searchParams;

  const page = parseInt(params.page || "1", 10);
  const name = params.name || "";
  const faxNumber = params.faxNumber || "";
  const showInactive = params.showInactive === "true";

  // Server側でデータ取得
  const result = await getLocalFaxPhonebook({
    page,
    name,
    faxNumber,
    showInactive,
  });

  // エラー時
  if (!result.ok) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">ローカルFAX電話帳</h1>
        <p className="text-red-500 mt-4">{result.error}</p>
      </div>
    );
  }

  // 成功時
  const { entries, pagination } = result;

  return (
    <CmLocalFaxPhonebookPageContent
      entries={entries}
      pagination={pagination}
      initialFilters={{
        name,
        faxNumber,
        showInactive,
      }}
    />
  );
}