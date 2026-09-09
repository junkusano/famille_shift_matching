"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Run = { id: string; target_month: string; evaluation_date: string; started_at: string; finished_at: string | null; last_sent_at: string | null; status: string; target_count: number; sent_count: number; task_count: number; error_count: number; skipped_count: number };
type Item = { id: string; client_name: string; client_info_id: string; kaipoke_cs_id: string; status: string; note: string; processed_at: string | null; monitoring_id: string | null; event_task_id: string | null };
const labels: Record<string, string> = { pending: "待機", processing: "処理中", sent: "FAX受付済み", task_created: "不備・イベント追加済み", skipped: "作成済み", error: "処理エラー", running: "実行待ち／進行中", completed: "完了", failed: "失敗" };
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—";

async function request(path: string, post = false) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(path, { method: post ? "POST" : "GET", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || "処理に失敗しました");
  return payload;
}

export default function MonitoringBulkAdmin() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const stop = useRef(false);
  const active = useRef(false);
  const refresh = useCallback(async (id = "") => {
    const payload = await request(`/api/monitorings/bulk${id ? `?run_id=${encodeURIComponent(id)}` : ""}`);
    setRuns(payload.runs ?? []);
    setItems(payload.items ?? []);
    setSelected(id || payload.runs?.[0]?.id || "");
  }, []);
  useEffect(() => { void refresh().catch(e => setError(String(e.message))); return () => { stop.current = true; }; }, [refresh]);

  async function process(id: string) {
    stop.current = false;
    while (!stop.current) {
      const result = await request(`/api/monitorings/bulk/${id}/next`, true);
      await refresh(id);
      if (result.done) break;
      if (result.busy) { setError("別の処理が実行中です。完了後に再開してください。長時間変わらない場合は送付履歴の確認が必要です。"); break; }
    }
  }
  async function start(resumeId?: string) {
    if (active.current) return;
    if (!resumeId && !window.confirm("前月にシフトがある利用者のモニタリングを順次生成し、PDFをFAX送付します。不備がある利用者はイベント管理にタスクを追加します。開始しますか？")) return;
    active.current = true;
    setWorking(true); setError("");
    try {
      const id = resumeId || (await request("/api/monitorings/bulk", true)).run.id;
      await refresh(id);
      await process(id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { active.current = false; setWorking(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
    <h2 className="text-xl font-bold">前月分の一斉生成・FAX送付</h2>
    <p className="text-sm text-slate-600">前月1日〜末日のシフトを対象に、評価日を送付日として作成します。不備は「マネジャー向け具体的な書類等対応」のイベントに追加します。</p>
    <p className="text-sm text-slate-600">処理中はこの画面を開いたままにしてください。中断した場合は実行履歴から再開できます。</p>
    <div className="flex gap-3"><button disabled={working} onClick={() => void start()} className="rounded bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">前月分の一斉送付を開始</button>{working && <button onClick={() => { stop.current = true; }} className="rounded border px-4 py-2">この利用者の処理後に停止</button>}<button disabled={working} onClick={() => void refresh(selected).catch(e => setError(e.message))} className="rounded border px-4 py-2">更新</button></div>
    {working && <p className="text-blue-700">利用者ごとに順番に処理しています…</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["対象月", "開始日時", "最終送付日時", "状態", "FAX受付／不備／作成済／エラー", ""].map((x,i) => <th key={i} className="p-2">{x}</th>)}</tr></thead><tbody>{runs.map(run => <tr key={run.id} className="border-t"><td className="p-2"><button disabled={working} onClick={() => void refresh(run.id).catch(e => setError(e.message))} className="text-blue-700 underline">{run.target_month}</button></td><td className="p-2">{dateTime(run.started_at)}</td><td className="p-2">{dateTime(run.last_sent_at)}</td><td className="p-2">{labels[run.status] ?? run.status}</td><td className="p-2">{run.sent_count}／{run.task_count}／{run.skipped_count}／{run.error_count}（全{run.target_count}名）</td><td className="p-2">{run.status === "running" && <button disabled={working} onClick={() => void start(run.id)} className="text-blue-700 underline">再開</button>}</td></tr>)}</tbody></table></div>
    {!runs.length && <p className="text-sm text-slate-500">一斉送付の履歴はありません。</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">利用者</th><th className="p-2">結果</th><th className="p-2">処理日時</th><th className="p-2">内容</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-t"><td className="p-2">{item.client_name}</td><td className="p-2">{labels[item.status] ?? item.status}</td><td className="p-2">{dateTime(item.processed_at)}</td><td className="p-2">{item.note}{item.monitoring_id && <Link className="ml-2 text-blue-700 underline" href={`/portal/kaipoke-info-detail/${item.client_info_id}/monitoring/${item.monitoring_id}`}>モニタリング</Link>}{item.event_task_id && <Link className="ml-2 text-blue-700 underline" href={`/portal/event-tasks?id=${item.event_task_id}`}>イベント</Link>}</td></tr>)}</tbody></table></div>
  </section>;
}
