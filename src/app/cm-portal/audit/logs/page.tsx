// =============================================================
// src/app/cm-portal/audit/logs/page.tsx
// システムログ管理画面（Server Component）
// =============================================================

import { getAuditLogs } from "@/lib/cm/audit/getAuditLogs";
import { CmAuditLogsPageContent } from "@/components/cm-components/audit/CmAuditLogsPageContent";

type Props = {
  searchParams: Promise<{
    page?: string;
    env?: string;
    level?: string;
    module?: string;
    message?: string;
    traceId?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function CmAuditLogsPage({ searchParams }: Props) {
  const params = await searchParams;

  const page = parseInt(params.page || "1", 10);
  const env = params.env || "";
  const level = params.level || "";
  const moduleName = params.module || "";
  const message = params.message || "";
  const traceId = params.traceId || "";
  const from = params.from || "";
  const to = params.to || "";

  // Server側でデータ取得
  const result = await getAuditLogs({
    page,
    env,
    level,
    moduleName,
    message,
    traceId,
    from,
    to,
  });

  // エラー時
  if (result.ok === false) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">システムログ</h1>
        <p className="text-red-500 mt-4">{result.error}</p>
      </div>
    );
  }

  // 成功時
  const { logs, pagination } = result;

  return (
    <CmAuditLogsPageContent
      logs={logs}
      pagination={pagination}
      initialFilters={{
        env,
        level,
        moduleName,
        message,
        traceId,
        from,
        to,
      }}
    />
  );
}