// src/app/portal/fax-history/page.tsx
"use client";

import TableViewer, { type TableColumnConfig } from "@/components/TableViewer";
import { useUserRole } from "@/context/RoleContext";

const STATUS_LABELS: Record<string, string> = {
  requesting: "送信依頼中",
  accepted: "受付済",
  completed: "送信完了",
  error: "送信エラー",
  request_failed: "受付失敗",
  unknown: "状態不明",
};

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || !value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatFileNames(value: unknown) {
  if (!Array.isArray(value)) return "-";
  return value.filter((item): item is string => typeof item === "string").join(", ") || "-";
}

const columns: TableColumnConfig[] = [
  {
    key: "created_at",
    label: "送信依頼日時",
    width: "180px",
    format: formatDateTime,
  },
  {
    key: "status",
    label: "ステータス",
    width: "130px",
    filterMode: "exact",
    format: (value) => {
      const status = typeof value === "string" ? value : "unknown";
      return STATUS_LABELS[status] ?? status;
    },
  },
  {
    key: "office_name",
    label: "事業所名",
    width: "240px",
  },
  {
    key: "fax_number",
    label: "FAX番号",
    width: "150px",
  },
  {
    key: "subject",
    label: "件名",
    width: "160px",
  },
  {
    key: "file_names",
    label: "添付ファイル",
    width: "280px",
    sortable: false,
    filterable: false,
    format: formatFileNames,
  },
  {
    key: "accepted_at",
    label: "faximo受付日時",
    width: "180px",
  },
  {
    key: "faximo_request_id",
    label: "faximo受付ID",
    width: "150px",
  },
  {
    key: "process_key",
    label: "処理キー",
    width: "190px",
  },
  {
    key: "status_message",
    label: "結果詳細",
    width: "300px",
  },
  {
    key: "result_mail_received_at",
    label: "結果メール受信日時",
    width: "190px",
    format: formatDateTime,
  },
];

export default function FaxHistoryPage() {
  const role = useUserRole();

  if (!['admin', 'manager'].includes(role)) {
    return (
      <div className="p-4 text-red-600">
        このページは管理者およびマネジャーのみがアクセスできます。
      </div>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">FAX送信履歴</h1>
        <p className="mt-1 text-sm text-slate-500">
          送信受付時に登録し、faximoSilverの結果通知メール受信後にステータスを更新します。
        </p>
      </div>

      <TableViewer
        tableName="fax_log"
        title="FAX送信履歴一覧"
        columns={columns}
        defaultSort={{ column: "created_at", ascending: false }}
        pageSize={50}
        emptyMessage="FAX送信履歴はありません"
      />
    </main>
  );
}
