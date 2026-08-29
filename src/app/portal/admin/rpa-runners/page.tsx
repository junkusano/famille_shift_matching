'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Runner = { runner_id: string; runner_name: string; is_active: boolean; last_heartbeat_at: string | null; last_status: 'online' | 'busy' | null; current_job_id: string | null };
type Job = { id: string; job_type: string; payload: Record<string, unknown>; timeout_ms: number | null; status: string; target_runner_id: string | null; claimed_runner_id: string | null; created_at: string; error_message: string | null };
const defaultRunnerForm = { runner_id: '', runner_name: '', token: '' };

export default function RpaRunnersPage() {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runnerForm, setRunnerForm] = useState(defaultRunnerForm);
  const [targetRunnerId, setTargetRunnerId] = useState('');
  const [durationMs, setDurationMs] = useState('3000');
  const [timeoutMs, setTimeoutMs] = useState('10000');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function authHeaders() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('ログインセッションを確認できません。再ログインしてください。');
    return { Authorization: `Bearer ${data.session.access_token}` };
  }
  async function request(path: string, options?: RequestInit) {
    const response = await fetch(path, { ...options, headers: { ...(options?.headers ?? {}), ...(await authHeaders()) } });
    const body = await response.json() as { ok: boolean; error?: string; runners?: Runner[]; jobs?: Job[] };
    if (!response.ok) throw new Error(body.error ?? '通信に失敗しました。');
    return body;
  }
  async function load() {
    try {
      setLoading(true);
      const [runnersResponse, jobsResponse] = await Promise.all([request('/api/rpa/admin/runners'), request('/api/rpa/admin/jobs')]);
      setRunners(runnersResponse.runners ?? []); setJobs(jobsResponse.jobs ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : '読み込みに失敗しました。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function registerRunner() {
    try {
      setMessage('');
      await request('/api/rpa/admin/runners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(runnerForm) });
      setRunnerForm(defaultRunnerForm); setMessage('Runnerを登録しました。トークンは画面に保存・再表示されません。'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Runnerを登録できませんでした。'); }
  }
  async function queueTestJob() {
    const duration = Number(durationMs); const timeout = Number(timeoutMs);
    if (!Number.isSafeInteger(duration) || duration < 0 || !Number.isSafeInteger(timeout) || timeout <= 0) { setMessage('待機時間とタイムアウトは正しい整数で入力してください。'); return; }
    try {
      setMessage('');
      await request('/api/rpa/admin/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_type: 'test.sleep', payload: { duration_ms: duration }, timeout_ms: timeout, target_runner_id: targetRunnerId || null }) });
      setMessage('test.sleepジョブを登録しました。'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ジョブを登録できませんでした。'); }
  }
  async function toggleRunner(runner: Runner) {
    try { await request('/api/rpa/admin/runners', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runner_id: runner.runner_id, is_active: !runner.is_active }) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Runner状態を更新できませんでした。'); }
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900">
    <header><h1 className="text-xl font-bold">RPA Runner管理</h1><p className="mt-1 text-sm text-gray-600">実行PCを登録し、Runnerへ疎通確認用ジョブを送信します。トークンはハッシュ化して保存され、再表示されません。</p></header>
    {message && <div className="rounded border bg-blue-50 p-3 text-sm">{message}</div>}
    <section className="rounded border bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">Runner登録</h2><div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm"><span className="mb-1 block text-gray-600">Runner ID *</span><input className="w-full rounded border px-2 py-2" placeholder="kanayama-rpa-01" value={runnerForm.runner_id} onChange={(event) => setRunnerForm({ ...runnerForm, runner_id: event.target.value })} /></label>
      <label className="text-sm"><span className="mb-1 block text-gray-600">表示名 *</span><input className="w-full rounded border px-2 py-2" placeholder="金山RPA-PC-01" value={runnerForm.runner_name} onChange={(event) => setRunnerForm({ ...runnerForm, runner_name: event.target.value })} /></label>
      <label className="text-sm"><span className="mb-1 block text-gray-600">Runnerトークン *</span><input type="password" className="w-full rounded border px-2 py-2" value={runnerForm.token} onChange={(event) => setRunnerForm({ ...runnerForm, token: event.target.value })} /></label>
    </div><button className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => void registerRunner()}>登録</button></section>
    <section className="rounded border bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">疎通確認ジョブ</h2><div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm"><span className="mb-1 block text-gray-600">対象Runner</span><select className="w-full rounded border px-2 py-2" value={targetRunnerId} onChange={(event) => setTargetRunnerId(event.target.value)}><option value="">いずれかのRunner</option>{runners.filter((runner) => runner.is_active).map((runner) => <option key={runner.runner_id} value={runner.runner_id}>{runner.runner_name} ({runner.runner_id})</option>)}</select></label>
      <label className="text-sm"><span className="mb-1 block text-gray-600">待機時間（ms）</span><input type="number" min="0" className="w-full rounded border px-2 py-2" value={durationMs} onChange={(event) => setDurationMs(event.target.value)} /></label>
      <label className="text-sm"><span className="mb-1 block text-gray-600">タイムアウト（ms）</span><input type="number" min="1" className="w-full rounded border px-2 py-2" value={timeoutMs} onChange={(event) => setTimeoutMs(event.target.value)} /></label>
    </div><button className="mt-4 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => void queueTestJob()}>test.sleepを登録</button></section>
    <section className="overflow-x-auto rounded border bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Runner一覧</h2><button className="rounded border px-3 py-1 text-sm" onClick={() => void load()} disabled={loading}>{loading ? '更新中…' : '更新'}</button></div><table className="min-w-full text-left text-sm"><thead className="bg-gray-50"><tr>{['名前 / ID', '状態', '最終heartbeat', '実行中ジョブ', '操作'].map((label) => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{runners.map((runner) => <tr className="border-t" key={runner.runner_id}><td className="px-3 py-2"><div className="font-medium">{runner.runner_name}</div><div className="font-mono text-xs text-gray-500">{runner.runner_id}</div></td><td className="px-3 py-2">{runner.is_active ? (runner.last_status === 'busy' ? '実行中' : '有効') : '無効'}</td><td className="px-3 py-2">{runner.last_heartbeat_at ? new Date(runner.last_heartbeat_at).toLocaleString('ja-JP') : '未接続'}</td><td className="px-3 py-2 font-mono text-xs">{runner.current_job_id ?? '—'}</td><td className="px-3 py-2"><button className="text-sm text-blue-700" onClick={() => void toggleRunner(runner)}>{runner.is_active ? '無効化' : '有効化'}</button></td></tr>)}{runners.length === 0 && <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={5}>Runnerが未登録です</td></tr>}</tbody></table></section>
    <section className="overflow-x-auto rounded border bg-white"><div className="border-b px-4 py-3"><h2 className="font-semibold">最近のジョブ</h2></div><table className="min-w-full text-left text-sm"><thead className="bg-gray-50"><tr>{['タイプ', '状態', '対象 / 実行Runner', '作成日時', 'エラー'].map((label) => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{jobs.map((job) => <tr className="border-t" key={job.id}><td className="px-3 py-2"><div className="font-mono">{job.job_type}</div><div className="text-xs text-gray-500">{JSON.stringify(job.payload)}</div></td><td className="px-3 py-2">{job.status}</td><td className="px-3 py-2 font-mono text-xs">{job.target_runner_id ?? 'any'} / {job.claimed_runner_id ?? '—'}</td><td className="px-3 py-2">{new Date(job.created_at).toLocaleString('ja-JP')}</td><td className="px-3 py-2 text-red-700">{job.error_message ?? '—'}</td></tr>)}{jobs.length === 0 && <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={5}>ジョブがありません</td></tr>}</tbody></table></section>
  </main>;
}
