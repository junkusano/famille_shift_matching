"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Play, RefreshCw, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { knowledgeApi } from "@/components/knowledge/api";
import type { KnowledgeRunResult, KnowledgeSource } from "@/lib/knowledge/types";

type SourceResponse = { ok: true; sources: KnowledgeSource[] };
type RunResponse = { ok: true; result: KnowledgeRunResult };

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

function connectionLabel(source: KnowledgeSource) {
  if (source.last_error_at && (!source.last_success_at || source.last_error_at > source.last_success_at)) return { text: "エラー", className: "bg-rose-100 text-rose-800" };
  if (source.last_success_at) return { text: "接続確認済み", className: "bg-emerald-100 text-emerald-800" };
  return { text: "未確認", className: "bg-slate-100 text-slate-700" };
}

export function KnowledgeSourcesAdmin() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await knowledgeApi<SourceResponse>("/api/admin/knowledge/sources");
      setSources(response.sources);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function patchSource(source: KnowledgeSource, patch: Record<string, unknown>) {
    setBusy(source.id);
    setMessage("");
    try {
      await knowledgeApi(`/api/admin/knowledge/sources/${source.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setMessage(`${source.name} の設定を更新しました。`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新に失敗しました。");
    } finally {
      setBusy(null);
    }
  }

  async function run(source: KnowledgeSource, dryRun: boolean) {
    setBusy(source.id);
    setMessage("");
    try {
      const response = await knowledgeApi<RunResponse>(`/api/admin/knowledge/sources/${source.id}/${dryRun ? "dry-run" : "sync"}`, { method: "POST" });
      const result = response.result;
      setMessage(`${source.name}: ${dryRun ? "Dry Run" : "同期"}完了（処理 ${result.processed} / 作成候補 ${result.created} / 更新 ${result.updated} / スキップ ${result.skipped}）`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${dryRun ? "Dry Run" : "同期"}に失敗しました。`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><h2 className="font-bold text-slate-900">情報源</h2><p className="text-sm text-slate-600">最初はすべて無効です。Dry Runで確認してから有効化してください。</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className="mr-2" />再読込</Button>
      </div>
      {message && <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">情報源</th><th className="px-4 py-3">状態</th><th className="px-4 py-3">有効</th><th className="px-4 py-3">同期頻度</th><th className="px-4 py-3">最終実行・成功</th><th className="px-4 py-3">次回</th><th className="px-4 py-3">Cursor</th><th className="px-4 py-3">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">読み込み中…</td></tr> : sources.map((source) => {
              const connection = connectionLabel(source);
              const unsupported = !["google_sheets", "fax", "github"].includes(source.connector_key);
              return <tr key={source.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3"><p className="font-semibold text-slate-900">{source.name}</p><p className="text-xs text-slate-500">{source.source_type} / {source.connector_key}</p>{source.description && <p className="mt-1 max-w-sm text-xs text-slate-600">{source.description}</p>}{source.source_url && <a href={source.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"><ExternalLink size={12} />原本</a>}</td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs ${connection.className}`}>{connection.text}</span>{unsupported && <p className="mt-2 text-xs text-amber-700">connector準備中</p>}{source.last_error_message && <p className="mt-2 max-w-xs text-xs text-rose-700">{source.last_error_message}</p>}</td>
                <td className="px-4 py-3"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={source.enabled} disabled={busy === source.id || unsupported} onChange={(event) => void patchSource(source, { enabled: event.target.checked })} />{source.enabled ? "有効" : "無効"}</label></td>
                <td className="px-4 py-3"><select value={source.sync_frequency} disabled={busy === source.id || unsupported} onChange={(event) => void patchSource(source, { sync_frequency: event.target.value })} className="rounded border border-slate-300 bg-white px-2 py-1"><option value="manual">手動</option><option value="hourly">毎時</option><option value="daily">毎日</option><option value="weekly">毎週</option><option value="monthly">毎月</option></select></td>
                <td className="whitespace-nowrap px-4 py-3"><p>実行: {formatDate(source.last_run_at)}</p><p className="text-xs text-emerald-700">成功: {formatDate(source.last_success_at)}</p></td>
                <td className="whitespace-nowrap px-4 py-3">{formatDate(source.next_run_at)}</td>
                <td className="px-4 py-3"><code className="block max-w-xs truncate rounded bg-slate-100 px-2 py-1 text-xs">v{source.checkpoint?.cursor_version ?? 0} {JSON.stringify(source.checkpoint?.cursor ?? {})}</code></td>
                <td className="px-4 py-3"><div className="flex flex-col gap-2"><Button size="sm" variant="outline" disabled={busy === source.id || unsupported} onClick={() => void run(source, true)}><TestTube2 size={14} className="mr-1" />Dry Run</Button><Button size="sm" disabled={busy === source.id || unsupported} onClick={() => void run(source, false)}><Play size={14} className="mr-1" />手動同期</Button></div></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
