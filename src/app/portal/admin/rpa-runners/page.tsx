'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Runner = { runner_id: string; runner_name: string; is_active: boolean; last_heartbeat_at: string | null; last_status: 'online' | 'busy' | null; current_job_id: string | null };
type Job = { id: string; job_type: string; payload: Record<string, unknown>; timeout_ms: number | null; status: string; target_runner_id: string | null; claimed_runner_id: string | null; created_at: string; result?: Record<string, unknown> | null; error_code?: string | null; error_category?: string | null; error_message: string | null; retry_count?: number | null; failed_at?: string | null; lineworks_notified_at?: string | null };
const defaultRunnerForm = { runner_id: '', runner_name: '', token: '' };

function jobStatusLabel(status: string): string {
  if (status === 'pending') return 'queued';
  if (status === 'claimed') return 'running';
  if (status === 'completed') return 'succeeded';
  return status;
}

function jobResultLabel(job: Job): string {
  if (job.status !== 'completed' || job.job_type !== 'kaipoke.client_sync' || !job.result) return job.error_message ?? '—';
  const processed = typeof job.result.processed_count === 'number' ? job.result.processed_count : 0;
  const updated = typeof job.result.upserted_count === 'number' ? job.result.upserted_count : 0;
  const failed = typeof job.result.failure_count === 'number' ? job.result.failure_count : 0;
  return `${job.payload.dry_run === true ? 'テスト確認' : '更新'} ${job.payload.dry_run === true ? processed : updated}件 / 失敗 ${failed}件`;
}

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
      const registration = {
        runner_id: runnerForm.runner_id.trim(),
        runner_name: runnerForm.runner_name.trim(),
        token: runnerForm.token.trim(),
      };
      if (!/^[A-Za-z0-9_-]{3,80}$/.test(registration.runner_id)) throw new Error('Runner IDは英数字・ハイフン・アンダースコアで3〜80文字にしてください。');
      if (!registration.runner_name || registration.runner_name.length > 100) throw new Error('表示名はtrim後1〜100文字で入力してください。');
      if (registration.token.length < 32 || registration.token.length > 500) throw new Error('Runnerトークンはtrim後32〜500文字で入力してください。');
      await request('/api/rpa/admin/runners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(registration) });
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
  async function executeTaimeeFollow(dryRun: boolean) {
    try {
      setMessage("");
      await request("/api/rpa/admin/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_type: "taimee.daily_worker_follow_sms",
          payload: { client_id: "263546", days: [0, -1, -2], dry_run: dryRun },
          timeout_ms: 600000, target_runner_id: targetRunnerId || null,
        }),
      });
      setMessage(dryRun ? "テストJobを登録しました。SMSは送信されません。" : "本番SMS送信Jobを登録しました。");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Jobを登録できませんでした。"); }
  }
  async function executeKaipokeClientSync(dryRun: boolean) {
    try {
      setMessage('');
      await request('/api/rpa/admin/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_type: 'kaipoke.client_sync',
          payload: { dry_run: dryRun },
          timeout_ms: 1800000, target_runner_id: targetRunnerId || null,
        }),
      });
      setMessage(dryRun
        ? 'カイポケ一括同期のテストJobを登録しました。Myファミーユは更新されません。'
        : 'カイポケ利用者情報の一括同期Jobを登録しました。');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Jobを登録できませんでした。'); }
  }
  async function toggleRunner(runner: Runner) {
    try { await request('/api/rpa/admin/runners', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runner_id: runner.runner_id, is_active: !runner.is_active }) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Runner状態を更新できませんでした。'); }
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-4 text-gray-900">
    <header><h1 className="text-xl font-bold">RPA Runner管理</h1><p className="mt-1 text-sm text-gray-600">実行PCを登録し、Runnerへ疎通確認用ジョブを送信します。トークンはハッシュ化して保存され、再表示されません。</p><p className="mt-1 text-sm text-gray-600">定期実行予定は <a className="text-blue-700 underline" href="/portal/admin/rpa-job-definitions">RPA Job定義</a> で確認・設定します。タイミー勤務者フォローはJST 13:00・19:00を予定し、有効化するまで自動実行されません。</p></header>
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
    <section className="rounded border border-blue-300 bg-blue-50 p-4 shadow-sm"><h2 className="mb-2 font-semibold">カイポケ利用者情報一括同期</h2><p className="mb-3 text-sm text-gray-700">Chromeでカイポケの利用者「基本情報」を1件開いてから実行します。基本情報と、介護保険証または障害サービス受給者証を読み取り、利用者ごとに1回だけMyファミーユへupsertします。</p><div className="flex flex-wrap gap-3"><button className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void executeKaipokeClientSync(true)}>テスト実行（更新なし）</button><button className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void executeKaipokeClientSync(false)}>今すぐ一括同期</button></div></section>
    <section className="rounded border border-amber-300 bg-amber-50 p-4 shadow-sm"><h2 className="mb-2 font-semibold">タイミー勤務者フォロー</h2><p className="mb-3 text-sm text-gray-700">必ず先にテスト実行を行ってください。テストJobは当日・前日・前々日の対象者を取得しますが、SMS送信関数とSMS APIを呼びません。</p><div className="flex flex-wrap gap-3"><button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => void executeTaimeeFollow(true)}>テスト実行（SMS送信なし）</button><button className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void executeTaimeeFollow(false)}>今すぐ実行</button></div></section>    <section className="overflow-x-auto rounded border bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Runner一覧</h2><button className="rounded border px-3 py-1 text-sm" onClick={() => void load()} disabled={loading}>{loading ? '更新中…' : '更新'}</button></div><table className="min-w-full text-left text-sm"><thead className="bg-gray-50"><tr>{['名前 / ID', '状態', '最終heartbeat', '実行中ジョブ', '操作'].map((label) => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{runners.map((runner) => <tr className="border-t" key={runner.runner_id}><td className="px-3 py-2"><div className="font-medium">{runner.runner_name}</div><div className="font-mono text-xs text-gray-500">{runner.runner_id}</div></td><td className="px-3 py-2">{!runner.is_active ? '無効' : runner.last_status === 'busy' ? 'RUNNING' : runner.last_status === 'online' ? 'ONLINE' : '有効（未接続）'}</td><td className="px-3 py-2">{runner.last_heartbeat_at ? new Date(runner.last_heartbeat_at).toLocaleString('ja-JP') : '未接続'}</td><td className="px-3 py-2 font-mono text-xs">{runner.current_job_id ?? '—'}</td><td className="px-3 py-2"><button className="text-sm text-blue-700" onClick={() => void toggleRunner(runner)}>{runner.is_active ? '無効化' : '有効化'}</button></td></tr>)}{runners.length === 0 && <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={5}>Runnerが未登録です</td></tr>}</tbody></table></section>
    <section className="overflow-x-auto rounded border bg-white"><div className="border-b px-4 py-3"><h2 className="font-semibold">最近のジョブ</h2></div><table className="min-w-full text-left text-sm"><thead className="bg-gray-50"><tr>{['タイプ', '状態', '対象 / 実行Runner', '作成日時', '結果 / エラー'].map((label) => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{jobs.map((job) => <tr className="border-t" key={job.id}><td className="px-3 py-2"><div className="font-mono">{job.job_type}</div><div className="text-xs text-gray-500">{JSON.stringify(job.payload)}</div></td><td className="px-3 py-2">{jobStatusLabel(job.status)}</td><td className="px-3 py-2 font-mono text-xs">{job.target_runner_id ?? 'any'} / {job.claimed_runner_id ?? '—'}</td><td className="px-3 py-2">{new Date(job.created_at).toLocaleString('ja-JP')}</td><td className={job.status === 'failed' ? 'px-3 py-2 text-red-700' : 'px-3 py-2'}>{job.status === 'failed' ? <div className="space-y-1"><div>{job.error_message ?? '詳細なし'}</div><div className="text-xs text-gray-700">分類: {job.error_category ?? job.error_code ?? 'UNEXPECTED'} / 再試行: {job.retry_count ?? 0}回</div><div className="text-xs text-gray-700">failed: {job.failed_at ? new Date(job.failed_at).toLocaleString('ja-JP') : '—'}</div><div className="font-mono text-[11px] text-gray-600">Job ID: {job.id}</div>{job.lineworks_notified_at && <div className="text-xs text-emerald-700">LINE WORKS通知済み</div>}</div> : jobResultLabel(job)}</td></tr>)}{jobs.length === 0 && <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={5}>ジョブがありません</td></tr>}</tbody></table></section>
  </main>;
}
