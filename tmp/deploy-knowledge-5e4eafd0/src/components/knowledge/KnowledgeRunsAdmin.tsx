"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { knowledgeApi } from "@/components/knowledge/api";
import type { KnowledgeSource } from "@/lib/knowledge/types";

type Run = {
  id: string;
  created_at: string;
  started_at: string | null;
  source_id: string;
  source: { name: string; source_type: string } | null;
  job_type: string;
  status: string;
  processed: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  summarized_count: number;
  duration_ms: number | null;
  error_message: string | null;
  cursor_before: Record<string, unknown>;
  cursor_after: Record<string, unknown> | null;
};
type RunResponse = { ok: true; runs: Run[]; total: number };
type SourceResponse = { ok: true; sources: KnowledgeSource[] };

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "medium" }).format(new Date(value)) : "—";
const statusClass = (status: string) => status === "succeeded" ? "bg-emerald-100 text-emerald-800" : status === "failed" ? "bg-rose-100 text-rose-800" : status === "running" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700";

export function KnowledgeRunsAdmin() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("");
  const [jobType, setJobType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (sourceId) params.set("source_id", sourceId);
      if (status) params.set("status", status);
      if (jobType) params.set("job_type", jobType);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const [runResponse, sourceResponse] = await Promise.all([
        knowledgeApi<RunResponse>(`/api/admin/knowledge/runs?${params}`),
        knowledgeApi<SourceResponse>("/api/admin/knowledge/sources"),
      ]);
      setRuns(runResponse.runs);
      setSources(sourceResponse.sources);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同期履歴を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, jobType, sourceId, status]);

  useEffect(() => { void load(); }, [load]);

  return <section className="space-y-4">
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="rounded border border-slate-300 px-3 py-2"><option value="">全情報源</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded border border-slate-300 px-3 py-2"><option value="">全status</option><option value="running">実行中</option><option value="succeeded">成功</option><option value="failed">失敗</option><option value="skipped">スキップ</option></select>
        <select value={jobType} onChange={(event) => setJobType(event.target.value)} className="rounded border border-slate-300 px-3 py-2"><option value="">全job type</option><option value="incremental">incremental</option><option value="manual">manual</option><option value="dry_run">dry run</option><option value="initial_scan">initial scan</option></select>
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded border border-slate-300 px-3 py-2" />
        <Button variant="outline" onClick={() => void load()}><RefreshCw size={16} className="mr-2" />更新</Button>
      </div>
    </div>
    {message && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{message}</div>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[1500px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-3 py-3">実行日時</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Job</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Processed</th><th className="px-3 py-3">Created</th><th className="px-3 py-3">Updated</th><th className="px-3 py-3">Skipped</th><th className="px-3 py-3">Summarized</th><th className="px-3 py-3">Duration</th><th className="px-3 py-3">Error</th><th className="px-3 py-3">Cursor before → after</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-500">読み込み中…</td></tr> : runs.length === 0 ? <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-500">実行履歴はありません。</td></tr> : runs.map((run) => <tr key={run.id} className="align-top hover:bg-slate-50"><td className="whitespace-nowrap px-3 py-3">{formatDate(run.started_at ?? run.created_at)}</td><td className="px-3 py-3"><p className="font-medium">{run.source?.name ?? run.source_id}</p><p className="text-xs text-slate-500">{run.source?.source_type}</p></td><td className="px-3 py-3">{run.job_type}</td><td className="px-3 py-3"><span className={`rounded px-2 py-1 text-xs ${statusClass(run.status)}`}>{run.status}</span></td><td className="px-3 py-3 text-right">{run.processed}</td><td className="px-3 py-3 text-right">{run.created_count}</td><td className="px-3 py-3 text-right">{run.updated_count}</td><td className="px-3 py-3 text-right">{run.skipped_count}</td><td className="px-3 py-3 text-right">{run.summarized_count}</td><td className="whitespace-nowrap px-3 py-3">{run.duration_ms === null ? "—" : `${run.duration_ms} ms`}</td><td className="max-w-sm px-3 py-3 text-xs text-rose-700">{run.error_message ?? "—"}</td><td className="px-3 py-3"><code className="block max-w-sm truncate rounded bg-slate-100 p-1 text-xs">{JSON.stringify(run.cursor_before)} → {JSON.stringify(run.cursor_after)}</code></td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}

