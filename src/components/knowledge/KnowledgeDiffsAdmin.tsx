"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { knowledgeApi } from "@/components/knowledge/api";

type DiffItem = {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  importance: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  source_count: number;
};
type DiffRun = {
  id: string;
  status: string;
  dry_run: boolean;
  started_at: string;
  completed_at: string | null;
  from_at: string;
  to_at: string;
  source_count: number;
  result_count: number;
  error_message: string | null;
};
type SourceItem = { id: string; knowledge_key: string; title: string; summary: string; knowledge_type: string; category: string | null; importance: number; updated_at: string };
type DiffResponse = { ok: true; items: DiffItem[]; runs: DiffRun[] };
type DetailResponse = { ok: true; item: { id: string; title: string }; sources: SourceItem[] };
type RunResponse = { ok: true; result: { message: string; sourceCount: number; resultCount: number; candidates: Array<{ title: string; summary: string; importance: number; sourceCount: number }> } };

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
const statusClass = (status: string) => status === "succeeded" ? "bg-emerald-100 text-emerald-800" : status === "failed" ? "bg-rose-100 text-rose-800" : status === "previewed" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700";

export function KnowledgeDiffsAdmin() {
  const [items, setItems] = useState<DiffItem[]>([]);
  const [runs, setRuns] = useState<DiffRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<RunResponse["result"] | null>(null);
  const [sourceDialog, setSourceDialog] = useState<{ title: string; sources: SourceItem[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await knowledgeApi<DiffResponse>("/api/admin/knowledge/diffs");
      setItems(response.items);
      setRuns(response.runs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "差分ナレッジを取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "apply");
    setMessage("");
    try {
      const response = await knowledgeApi<RunResponse>("/api/admin/knowledge/diffs/run", { method: "POST", body: JSON.stringify({ dry_run: dryRun }) });
      setPreview(dryRun ? response.result : null);
      setMessage(response.result.message);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "差分ナレッジの生成に失敗しました。");
    } finally {
      setBusy(null);
    }
  }

  async function showSources(item: DiffItem) {
    try {
      const response = await knowledgeApi<DetailResponse>(`/api/admin/knowledge/diffs/${item.id}`);
      setSourceDialog({ title: item.title, sources: response.sources });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "元ナレッジを取得できませんでした。");
    }
  }

  const latestRun = runs[0];
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">差分ナレッジ</h2><p className="mt-1 text-sm text-slate-600">前回の正常実行以降に増えた・変わったナレッジを、判断に必要な変化として整理します。毎週月曜 03:30（JST）に自動実行されます。</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy !== null} onClick={() => void run(true)}><Eye size={16} className="mr-2" />{busy === "preview" ? "プレビュー中…" : "プレビュー"}</Button><Button disabled={busy !== null} onClick={() => void run(false)}><Play size={16} className="mr-2" />{busy === "apply" ? "生成中…" : "今すぐ生成"}</Button><Button variant="outline" size="icon" aria-label="再読込" disabled={loading} onClick={() => void load()}><RefreshCw size={16} /></Button></div>
    </div>
    {latestRun && <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-sm md:grid-cols-4"><div>前回: {formatDate(latestRun.completed_at ?? latestRun.started_at)}</div><div>対象期間: {formatDate(latestRun.from_at)} 〜 {formatDate(latestRun.to_at)}</div><div>入力: {latestRun.source_count}件</div><div>生成: {latestRun.result_count}件 <span className={`ml-1 rounded px-2 py-0.5 text-xs ${statusClass(latestRun.status)}`}>{latestRun.status}</span></div></div>}
    {message && <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div>}
    {preview && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">プレビュー結果（DBには保存していません）</p><ul className="mt-2 list-disc space-y-1 pl-5">{preview.candidates.length ? preview.candidates.map((candidate) => <li key={candidate.title}>{candidate.title}（重要度 {candidate.importance}・元ナレッジ {candidate.sourceCount}件）</li>) : <li>保存する差分候補はありません。</li>}</ul></div>}
    <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-3 py-3">対象期間</th><th className="px-3 py-3">生成日時</th><th className="px-3 py-3">タイトル・概要</th><th className="px-3 py-3">カテゴリ</th><th className="px-3 py-3">重要度</th><th className="px-3 py-3">元ナレッジ</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">読み込み中…</td></tr> : items.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">保存済みの差分ナレッジはありません。</td></tr> : items.map((item) => <tr key={item.id} className="align-top hover:bg-slate-50"><td className="whitespace-nowrap px-3 py-3">{item.period_start ?? "—"} 〜 {item.period_end ?? "—"}</td><td className="whitespace-nowrap px-3 py-3">{formatDate(item.created_at)}</td><td className="max-w-xl px-3 py-3"><p className="font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-slate-600">{item.summary}</p></td><td className="px-3 py-3">{item.category ?? "—"}</td><td className="px-3 py-3">{item.importance}</td><td className="px-3 py-3"><Button size="sm" variant="outline" onClick={() => void showSources(item)}>{item.source_count}件を確認</Button></td></tr>)}</tbody></table></div>
    <Dialog open={sourceDialog !== null} onOpenChange={(open) => { if (!open) setSourceDialog(null); }}><DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>元ナレッジ</DialogTitle><DialogDescription>{sourceDialog?.title}</DialogDescription></DialogHeader><div className="space-y-3 text-sm">{sourceDialog?.sources.map((source) => <div key={source.id} className="rounded border border-slate-200 p-3"><p className="font-semibold">{source.title}</p><p className="mt-1 text-slate-600">{source.summary}</p><p className="mt-2 text-xs text-slate-500">{source.knowledge_type} / {source.category ?? "未分類"} / 重要度 {source.importance}</p></div>)}{sourceDialog && sourceDialog.sources.length === 0 && <p className="text-slate-500">元ナレッジが見つかりません。</p>}</div><DialogFooter><Button onClick={() => setSourceDialog(null)}>閉じる</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
