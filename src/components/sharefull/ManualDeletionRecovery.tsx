"use client";

import { useCallback, useEffect, useState } from "react";

type Candidate = {
  request_id: string;
  shift_id: number;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  template_id: string;
  failed_job_id: string | null;
  failed_at: string | null;
  failure_summary: string | null;
};

type Audit = {
  id: string;
  request_id: string;
  sharefull_job_id: string;
  sharefull_order_id: string | null;
  confirmed_by: string;
  confirmed_at: string;
  reason: string;
  requeue_job_id: string | null;
};

type ApiResult = { ok?: boolean; error?: string; candidates?: Candidate[]; audits?: Audit[]; audit_id?: string; job_id?: string; already_recorded?: boolean };

export default function ManualDeletionRecovery() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [requestId, setRequestId] = useState("");
  const [sharefullJobId, setSharefullJobId] = useState("");
  const [sharefullOrderId, setSharefullOrderId] = useState("");
  const [reason, setReason] = useState("Sharefull画面で手動削除済みであることを確認");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = candidates.find((candidate) => candidate.request_id === requestId) ?? null;

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/rpa/sharefull/manual-deletion", { credentials: "include", cache: "no-store" });
      const result = await response.json() as ApiResult;
      if (!response.ok || result.ok !== true || !Array.isArray(result.candidates)) {
        throw new Error(result.error ?? `対象案件の取得に失敗しました（HTTP ${response.status}）`);
      }
      setCandidates(result.candidates);
      setAudits(result.audits ?? []);
      setRequestId((current) => result.candidates?.some((candidate) => candidate.request_id === current)
        ? current
        : result.candidates?.[0]?.request_id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "対象案件を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCandidates(); }, [loadCandidates]);

  async function recordAndRequeue() {
    if (!selected) return;
    const message = [
      `${selected.date} ${selected.start_time.slice(0, 5)}「${selected.title}」`,
      `Sharefull求人ID ${sharefullJobId}`,
      "手動削除を記録し、掲載ジョブを1件登録します。Runnerがすぐに再掲載する可能性があります。",
    ].join("\n");
    if (!window.confirm(message)) return;

    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/rpa/sharefull/manual-deletion", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: selected.request_id,
          sharefull_job_id: sharefullJobId.trim(),
          sharefull_order_id: sharefullOrderId.trim() || null,
          reason: reason.trim(),
          confirm_deleted: true,
        }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error ?? `削除記録・再投入に失敗しました（HTTP ${response.status}）`);
      }
      setMessage(`${result.already_recorded ? "既存の削除記録を確認" : "削除記録を保存"}しました。掲載ジョブID: ${result.job_id ?? "不明"}（監査ID: ${result.audit_id ?? "不明"}）`);
      setSharefullJobId("");
      setSharefullOrderId("");
      await loadCandidates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "削除記録・再投入に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3" aria-labelledby="sharefull-manual-deletion-title">
      <div>
        <h2 id="sharefull-manual-deletion-title" className="font-semibold">Sharefull手動削除の記録・再投入</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          掲載結果が不明で停止した案件だけが表示されます。削除記録の保存と対象案件1件の再投入を同時に行います。
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="block">対象案件</span>
          <select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={requestId} onChange={(event) => setRequestId(event.target.value)} disabled={loading || candidates.length === 0}>
            {candidates.length === 0 && <option value="">再投入対象なし</option>}
            {candidates.map((candidate) => (
              <option key={candidate.request_id} value={candidate.request_id}>
                {candidate.date} {candidate.start_time.slice(0, 5)} {candidate.title}（シフトID {candidate.shift_id}）
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="block">削除済みのSharefull求人ID</span>
          <input className="h-9 w-full rounded-md border bg-white px-2 text-sm" inputMode="numeric" value={sharefullJobId} onChange={(event) => setSharefullJobId(event.target.value)} placeholder="例: 191413124163" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="block">Sharefull管理番号（任意）</span>
          <input className="h-9 w-full rounded-md border bg-white px-2 text-sm" inputMode="numeric" value={sharefullOrderId} onChange={(event) => setSharefullOrderId(event.target.value)} placeholder="求人詳細URLの番号" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="block">確認理由</span>
          <input className="h-9 w-full rounded-md border bg-white px-2 text-sm" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </div>

      {selected && <p className="text-xs text-slate-700">失敗ジョブ: {selected.failed_job_id ?? "不明"}{selected.failure_summary ? `｜${selected.failure_summary}` : ""}</p>}
      {message && <p className="text-sm text-green-800" role="status">{message}</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="h-9 rounded-md bg-amber-800 px-3 text-sm font-medium text-white disabled:opacity-50" onClick={() => void recordAndRequeue()} disabled={!selected || loading || submitting || !/^\d{4,}$/.test(sharefullJobId.trim()) || !reason.trim()}>
          {submitting ? "記録・登録中…" : "削除を記録して再投入"}
        </button>
        <button type="button" className="h-9 rounded-md border bg-white px-3 text-sm disabled:opacity-50" onClick={() => void loadCandidates()} disabled={loading || submitting}>
          {loading ? "確認中…" : "対象を再読込"}
        </button>
        <span className="text-xs text-muted-foreground">{loading ? "取得中" : `${candidates.length}件`}</span>
      </div>

      <details className="rounded border border-amber-200 bg-white p-2">
        <summary className="cursor-pointer text-sm font-medium">手動削除の記録（直近20件）</summary>
        {audits.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">記録はありません。</p> : (
          <ul className="mt-2 space-y-2 text-xs">
            {audits.map((audit) => (
              <li key={audit.id} className="border-t pt-2">
                <p>{new Date(audit.confirmed_at).toLocaleString("ja-JP")}｜求人ID {audit.sharefull_job_id}{audit.sharefull_order_id ? `（管理番号 ${audit.sharefull_order_id}）` : ""}</p>
                <p>対象案件ID: {audit.request_id}｜確認者: {audit.confirmed_by}｜再投入ジョブ: {audit.requeue_job_id ?? "なし"}</p>
                <p>理由: {audit.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
