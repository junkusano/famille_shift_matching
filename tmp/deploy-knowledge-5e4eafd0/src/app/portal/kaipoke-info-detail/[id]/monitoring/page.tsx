"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, FilePlus2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  MONITORING_SERVICE_LABELS,
  MONITORING_STATUS_LABELS,
  formatMonitoringPeriod,
  monthEnd,
  monthStart,
} from "@/lib/monitoring/core";
import type { MonitoringContext, MonitoringRecord, MonitoringServiceType } from "@/types/monitoring";

type ListRow = MonitoringRecord & {
  latest_fax: {
    status?: string;
    sent_at?: string | null;
    destination_name?: string | null;
    contact_name?: string | null;
  } | null;
};

function currentMonthJst(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${
    parts.find((part) => part.type === "month")?.value
  }`;
}

function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

export default function MonitoringListPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientInfoId = params.id;
  const [rows, setRows] = useState<ListRow[]>([]);
  const [clientName, setClientName] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [startMonth, setStartMonth] = useState(currentMonthJst());
  const [endMonth, setEndMonth] = useState(currentMonthJst());
  const [evaluationDate, setEvaluationDate] = useState(todayJst());
  const [serviceType, setServiceType] = useState<MonitoringServiceType | "">("");
  const [preview, setPreview] = useState<MonitoringContext | null>(null);
  const [working, setWorking] = useState(false);

  const periodStart = useMemo(() => monthStart(startMonth), [startMonth]);
  const periodEnd = useMemo(() => monthEnd(endMonth), [endMonth]);

  async function authorizedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "処理に失敗しました");
    return payload;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = await authorizedFetch(
        `/api/monitorings?client_info_id=${encodeURIComponent(clientInfoId)}`,
      );
      setRows(payload.data ?? []);
      setClientName(payload.client?.name ?? "");
      setCanManage(payload.permissions?.can_manage === true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientInfoId]);

  async function previewSources() {
    setWorking(true);
    setError("");
    try {
      const payload = await authorizedFetch("/api/monitorings/preview", {
        method: "POST",
        body: JSON.stringify({
          client_info_id: clientInfoId,
          period_start: periodStart,
          period_end: periodEnd,
        }),
      });
      const nextPreview = payload.data as MonitoringContext;
      setPreview(nextPreview);
      setServiceType(nextPreview.service_type_detected ?? "");
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  }

  async function createMonitoring() {
    if (!preview) return;
    if (!serviceType) {
      setError("サービス種別を選択してください");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const payload = await authorizedFetch("/api/monitorings", {
        method: "POST",
        body: JSON.stringify({
          client_info_id: clientInfoId,
          period_start: periodStart,
          period_end: periodEnd,
          evaluation_date: evaluationDate,
          service_type: serviceType,
        }),
      });
      router.push(
        `/portal/kaipoke-info-detail/${encodeURIComponent(clientInfoId)}/monitoring/${payload.data.id}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">利用者別モニタリング管理</p>
            <h1 className="text-2xl font-bold text-slate-900">{clientName || "利用者"} 様</h1>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setShowCreate((value) => !value);
                  setPreview(null);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
              >
                <FilePlus2 size={18} /> 新規モニタリング作成
              </button>
            )}
            <Link
              href={`/portal/kaipoke-info-detail/${encodeURIComponent(clientInfoId)}`}
              className="rounded-lg border bg-white px-4 py-2 text-slate-700 hover:bg-slate-100"
            >
              利用者詳細へ戻る
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
        )}

        {showCreate && canManage && (
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">対象期間を指定</h2>
            <p className="mt-1 text-sm text-slate-600">
              期間内の訪問記録だけを参照します。まず参照元を確認してから作成してください。
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <label className="text-sm font-medium">
                開始年月
                <input
                  type="month"
                  value={startMonth}
                  onChange={(event) => {
                    setStartMonth(event.target.value);
                    setPreview(null);
                  }}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium">
                終了年月
                <input
                  type="month"
                  value={endMonth}
                  onChange={(event) => {
                    setEndMonth(event.target.value);
                    setPreview(null);
                  }}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium">
                評価日
                <input
                  type="date"
                  value={evaluationDate}
                  onChange={(event) => setEvaluationDate(event.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={previewSources}
                  disabled={working || !startMonth || !endMonth}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {working ? "確認中…" : "参照情報を確認"}
                </button>
              </div>
            </div>

            {preview && (
              <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="font-bold">AIが参照する情報</h3>
                <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                  <div><dt className="text-slate-500">対象期間</dt><dd>{formatMonitoringPeriod(periodStart, periodEnd)}</dd></div>
                  <div><dt className="text-slate-500">プラン</dt><dd>{preview.summary.plan_period ?? "なし"}</dd></div>
                  <div><dt className="text-slate-500">訪問記録</dt><dd>{preview.summary.visit_count}件</dd></div>
                  <div><dt className="text-slate-500">前回モニタリング</dt><dd>{preview.summary.previous_monitoring_date ?? "なし"}</dd></div>
                  <div><dt className="text-slate-500">担当者</dt><dd>{preview.summary.care_manager_name ?? "未登録"}</dd></div>
                  <div><dt className="text-slate-500">FAX</dt><dd>{preview.summary.fax_number ?? "未登録"}</dd></div>
                </dl>
                {preview.warnings.length > 0 && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={17} />不足・確認事項</div>
                    <ul className="mt-2 list-disc pl-5">
                      {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                )}
                <label className="mt-4 block text-sm font-medium">
                  サービス種別
                  <select
                    value={serviceType}
                    onChange={(event) => setServiceType(event.target.value as MonitoringServiceType)}
                    className="mt-1 w-full max-w-sm rounded-md border bg-white px-3 py-2"
                  >
                    <option value="">選択してください</option>
                    <option value="care_insurance">介護保険型</option>
                    <option value="disability">障害福祉等の簡易型</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={createMonitoring}
                  disabled={working || !serviceType}
                  className="mt-4 rounded-md bg-emerald-600 px-5 py-2 font-semibold text-white disabled:opacity-50"
                >
                  この内容で下書きを作成
                </button>
              </div>
            )}
          </section>
        )}

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4"><h2 className="font-bold">モニタリング履歴</h2></div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-slate-500"><Loader2 className="animate-spin" /> 読み込み中</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-slate-500">モニタリング履歴はありません。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-100 text-left text-slate-700">
                  <tr>
                    <th className="px-4 py-3">対象期間</th><th className="px-4 py-3">評価日</th>
                    <th className="px-4 py-3">サービス種別</th><th className="px-4 py-3">作成日時</th>
                    <th className="px-4 py-3">作成者</th><th className="px-4 py-3">ステータス</th>
                    <th className="px-4 py-3">PDF</th><th className="px-4 py-3">FAX送信状況</th>
                    <th className="px-4 py-3">FAX送信日時</th><th className="px-4 py-3">送信先</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap">{formatMonitoringPeriod(row.period_start, row.period_end)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.evaluation_date}</td>
                      <td className="px-4 py-3">{MONITORING_SERVICE_LABELS[row.service_type]}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(row.created_at).toLocaleString("ja-JP")}</td>
                      <td className="px-4 py-3">{row.created_by_name || row.created_by}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold">{MONITORING_STATUS_LABELS[row.status]}</span></td>
                      <td className="px-4 py-3">{row.current_pdf_snapshot_id ? "確定版あり" : "未作成"}</td>
                      <td className="px-4 py-3">{row.latest_fax?.status === "accepted" ? "送信受付済み" : row.latest_fax?.status === "request_failed" ? "送信失敗" : "未送信"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.latest_fax?.sent_at ? new Date(row.latest_fax.sent_at).toLocaleString("ja-JP") : "-"}</td>
                      <td className="px-4 py-3">{row.latest_fax?.destination_name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/portal/kaipoke-info-detail/${encodeURIComponent(clientInfoId)}/monitoring/${row.id}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {canManage ? "編集・詳細" : "詳細"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
