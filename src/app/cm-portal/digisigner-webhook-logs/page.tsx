// =============================================================
// src/app/cm-portal/digisigner-webhook-logs/page.tsx
// DigiSigner Webhookログ管理画面（Server Component）
// =============================================================

import { getDigisignerWebhookLogs } from "@/lib/cm/contracts/getDigisignerWebhookLogs";
import { CmDigisignerWebhookLogsPageContent } from "@/components/cm-components/digisigner-webhook/CmDigisignerWebhookLogsPageContent";

type Props = {
  searchParams: Promise<{
    page?: string;
    status?: string;
    eventType?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function CmDigisignerWebhookLogsPage({ searchParams }: Props) {
  const params = await searchParams;

  const page = parseInt(params.page || "1", 10);
  const status = params.status || "";
  const eventType = params.eventType || "";
  const from = params.from || "";
  const to = params.to || "";

  // Server側でデータ取得
  const result = await getDigisignerWebhookLogs({
    page,
    status,
    eventType,
    from,
    to,
  });

  // エラー時
  if (result.ok === false) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-800">DigiSigner Webhookログ</h1>
        <p className="text-red-500 mt-4">{result.error}</p>
      </div>
    );
  }

  // 成功時
  const { logs, pagination, summary } = result;

  return (
    <CmDigisignerWebhookLogsPageContent
      logs={logs}
      pagination={pagination}
      summary={summary}
      initialFilters={{
        status,
        eventType,
        from,
        to,
      }}
    />
  );
}
