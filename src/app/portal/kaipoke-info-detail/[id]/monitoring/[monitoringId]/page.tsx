"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Printer,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  MONITORING_ACHIEVEMENT_LABELS,
  MONITORING_SERVICE_LABELS,
  MONITORING_STATUS_LABELS,
  formatMonitoringPeriod,
} from "@/lib/monitoring/core";
import type {
  MonitoringAchievement,
  MonitoringDetailResponse,
  MonitoringGoal,
  MonitoringRecord,
} from "@/types/monitoring";

function cloneMonitoring(value: MonitoringRecord): MonitoringRecord {
  return {
    ...value,
    notable_observations: [...(value.notable_observations ?? [])],
    monitoring_json: { ...(value.monitoring_json ?? {}) },
  };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function MonitoringEditorPage() {
  const params = useParams<{ id: string; monitoringId: string }>();
  const router = useRouter();
  const clientInfoId = params.id;
  const monitoringId = params.monitoringId;
  const [data, setData] = useState<MonitoringDetailResponse | null>(null);
  const [draft, setDraft] = useState<MonitoringRecord | null>(null);
  const [goals, setGoals] = useState<MonitoringGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);

  async function authHeaders(body = false): Promise<HeadersInit> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    return {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function api(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: { ...(await authHeaders(Boolean(init?.body))), ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      const failure = new Error(payload.error || "処理に失敗しました") as Error & {
        detailUrl?: string;
      };
      failure.detailUrl = payload.detail_url;
      throw failure;
    }
    return payload;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const payload = await api(`/api/monitorings/${monitoringId}`);
      const next = payload.data as MonitoringDetailResponse;
      setData(next);
      setDraft(cloneMonitoring(next.monitoring));
      setGoals(next.goals.map((goal) => ({ ...goal, ai_evidence_json: [...goal.ai_evidence_json] })));
      setDirty(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoringId]);

  const evidenceById = useMemo(
    () => new Map(data?.context.visit_records.map((visit) => [visit.evidence_id, visit]) ?? []),
    [data],
  );

  function updateDraft(patch: Partial<MonitoringRecord>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  }

  function updateGoal(id: string, patch: Partial<MonitoringGoal>) {
    setGoals((current) => current.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)));
    setDirty(true);
  }

  async function save(showSuccess = true): Promise<boolean> {
    if (!draft) return false;
    setWorking("save");
    setError("");
    setMessage("");
    try {
      await api(`/api/monitorings/${monitoringId}`, {
        method: "PUT",
        body: JSON.stringify({
          evaluation_date: draft.evaluation_date,
          client_request: draft.client_request,
          family_request: draft.family_request,
          issues: draft.issues,
          summary: draft.summary,
          notable_observations: draft.notable_observations,
          office_notice: draft.office_notice,
          goals,
        }),
      });
      if (showSuccess) setMessage("下書きを保存しました");
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setWorking("");
    }
  }

  async function generate() {
    if (!data) return;
    const warning = dirty
      ? "現在の未保存の編集内容はAI生成結果で上書きされます。続けますか？"
      : data.monitoring.generated_by_ai
        ? "現在のAI生成内容を再生成結果で上書きします。続けますか？"
        : "表示している参照情報を使ってAIモニタリング案を生成します。続けますか？";
    if (!window.confirm(warning)) return;
    setWorking("generate");
    setError("");
    setMessage("");
    try {
      await api(`/api/monitorings/${monitoringId}/generate`, { method: "POST" });
      setMessage("AIモニタリング案を生成しました。内容を確認・編集してください。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking("");
    }
  }

  async function confirmMonitoring() {
    if (!window.confirm("編集内容を保存し、サービス提供責任者確認済みとして確定しますか？")) return;
    if (!(await save(false))) return;
    setWorking("confirm");
    try {
      await api(`/api/monitorings/${monitoringId}/confirm`, { method: "POST" });
      setMessage("モニタリングを確定しました。PDFを作成できます。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking("");
    }
  }

  async function createPdf() {
    setWorking("pdf");
    setError("");
    setMessage("");
    try {
      await api(`/api/monitorings/${monitoringId}/pdf`, { method: "POST" });
      setMessage("確定PDFを作成し、Google Driveへ保存しました");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking("");
    }
  }

  async function getPdfBlob(snapshotId?: string): Promise<Blob> {
    const query = snapshotId ? `?snapshot_id=${encodeURIComponent(snapshotId)}` : "";
    const response = await fetch(`/api/monitorings/${monitoringId}/pdf${query}`, {
      headers: await authHeaders(),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "PDFを取得できませんでした");
    }
    return response.blob();
  }

  async function showPdf(mode: "view" | "download" | "print", snapshotId?: string) {
    setWorking(mode);
    setError("");
    try {
      const blob = await getPdfBlob(snapshotId);
      const url = URL.createObjectURL(blob);
      if (mode === "download") {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `monitoring-${monitoringId}.pdf`;
        anchor.click();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking("");
    }
  }

  async function sendFax() {
    if (!data) return;
    const target = data.context.fax_target;
    if (!target.fax_number) {
      setError(
        "モニタリングのFAX送信先が登録されていません。担当ケアマネジャー・相談支援事業所等のFAX番号を確認してください。",
      );
      return;
    }
    const acceptedBefore = data.fax_history.some((history) => history.status === "accepted");
    const prompt = [
      acceptedBefore ? "モニタリングを再度FAX送信します。" : "モニタリングをFAX送信します。",
      "",
      `送信先：${target.office_name ?? "名称未設定"}`,
      `担当：${target.contact_name ?? "未登録"}`,
      `FAX：${target.fax_number}`,
      "",
      `対象期間：${formatMonitoringPeriod(data.monitoring.period_start, data.monitoring.period_end)}`,
      "",
      "送信しますか？",
    ].join("\n");
    if (!window.confirm(prompt)) return;
    setWorking("fax");
    setError("");
    setMessage("");
    try {
      await api(`/api/monitorings/${monitoringId}/fax`, { method: "POST" });
      setMessage("FAX送信依頼が受け付けられました");
      await load();
    } catch (caught) {
      const failure = caught as Error & { detailUrl?: string };
      setError(failure.message);
    } finally {
      setWorking("");
    }
  }

  async function removeMonitoring() {
    if (!window.confirm("このモニタリングを削除しますか？")) return;
    setWorking("delete");
    try {
      await api(`/api/monitorings/${monitoringId}`, { method: "DELETE" });
      router.push(`/portal/kaipoke-info-detail/${clientInfoId}/monitoring`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking("");
    }
  }

  if (loading || !draft || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-slate-600">
        <Loader2 className="animate-spin" /> 読み込み中
      </div>
    );
  }

  const canManage = data.permissions.can_manage;
  const pdfReady = Boolean(draft.current_pdf_snapshot_id);
  const currentPdfSnapshot = data.pdf_snapshots.find(
    (snapshot) => String(snapshot.id) === draft.current_pdf_snapshot_id,
  );
  const currentPdfDriveUrl =
    typeof currentPdfSnapshot?.drive_web_view_link === "string"
      ? currentPdfSnapshot.drive_web_view_link
      : "";
  const previousPdfSnapshots = data.pdf_snapshots.filter(
    (snapshot) => String(snapshot.id) !== draft.current_pdf_snapshot_id,
  );
  const isConfirmed = draft.status === "confirmed";

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href={`/portal/kaipoke-info-detail/${clientInfoId}/monitoring`}
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                ← モニタリング一覧
              </Link>
              <h1 className="mt-2 text-2xl font-bold">{String(data.context.client.name ?? "利用者")} 様　モニタリング</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-slate-200 px-3 py-1 font-semibold">{MONITORING_STATUS_LABELS[draft.status]}</span>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-900">{MONITORING_SERVICE_LABELS[draft.service_type]}</span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">{formatMonitoringPeriod(draft.period_start, draft.period_end)}</span>
              </div>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void save()} disabled={Boolean(working)} className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50"><Save size={17} />下書き保存</button>
                <button onClick={generate} disabled={Boolean(working)} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"><Bot size={17} />{draft.generated_by_ai ? "AI再生成" : "AIモニタリング生成"}</button>
                <button onClick={confirmMonitoring} disabled={Boolean(working) || draft.status === "fax_sent"} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50"><CheckCircle2 size={17} />確定</button>
                <button onClick={createPdf} disabled={Boolean(working) || !isConfirmed} className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white disabled:opacity-40">PDF作成</button>
                <button onClick={sendFax} disabled={Boolean(working) || !pdfReady} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-40"><Send size={17} />{data.fax_history.some((history) => history.status === "accepted") ? "FAX再送" : "FAX送信"}</button>
              </div>
            )}
          </div>
          {working && <div className="mt-4 flex items-center gap-2 text-sm text-blue-700"><Loader2 className="animate-spin" size={17} />処理中です。この画面を閉じないでください。</div>}
          {message && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{message}</div>}
          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">基本情報・評価内容</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium">評価日<input type="date" value={draft.evaluation_date} disabled={!canManage} onChange={(event) => updateDraft({ evaluation_date: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 disabled:bg-slate-100" /></label>
                <div className="text-sm"><span className="font-medium">対象期間</span><div className="mt-1 rounded-md border bg-slate-50 px-3 py-2">{formatMonitoringPeriod(draft.period_start, draft.period_end)}</div></div>
              </div>
              <div className="mt-4 space-y-4">
                <TextArea label="本人の希望" value={draft.client_request} disabled={!canManage} onChange={(value) => updateDraft({ client_request: value })} />
                <TextArea label="家族の希望" value={draft.family_request} disabled={!canManage} onChange={(value) => updateDraft({ family_request: value })} />
                <TextArea label="解決すべき課題" value={draft.issues} disabled={!canManage} onChange={(value) => updateDraft({ issues: value })} />
                <TextArea label="全体経過（モニタリング本文）" value={draft.summary} disabled={!canManage} rows={7} onChange={(value) => updateDraft({ summary: value })} />
                <TextArea
                  label="注目すべき観察事項（1行1件）"
                  value={draft.notable_observations.join("\n")}
                  disabled={!canManage}
                  onChange={(value) => updateDraft({ notable_observations: value.split("\n").map((item) => item.trim()).filter(Boolean) })}
                />
              </div>
            </section>

            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">目標ごとの評価</h2>
              {goals.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed p-5 text-slate-500">プランの長期・短期目標がありません。全体経過を手入力してください。</div>
              ) : (
                <div className="mt-4 space-y-4">
                  {goals.map((goal) => (
                    <article key={goal.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <span className="text-xs font-semibold text-slate-500">{goal.goal_type === "long_term" ? "長期目標" : "短期目標"}</span>
                          <h3 className="mt-1 font-bold">{goal.goal_text}</h3>
                          <p className="mt-1 text-xs text-slate-500">評価期間：{goal.evaluation_start ?? "未設定"} ～ {goal.evaluation_end ?? "未設定"}</p>
                        </div>
                        <select value={goal.achievement_status} disabled={!canManage} onChange={(event) => updateGoal(goal.id, { achievement_status: event.target.value as MonitoringAchievement })} className="rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-100">
                          {Object.entries(MONITORING_ACHIEVEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                      <div className="mt-4 space-y-3">
                        <TextArea label="特記事項／目標達成状況に対する事業所および利用者・家族の評価" value={goal.evaluation_text} disabled={!canManage} rows={5} onChange={(value) => updateGoal(goal.id, { evaluation_text: value })} />
                        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={goal.review_required} disabled={!canManage} onChange={(event) => updateGoal(goal.id, { review_required: event.target.checked })} />今後の方針・計画見直しに関する情報共有が必要</label>
                        <TextArea label="変更内容・共有事項" value={goal.review_content} disabled={!canManage} onChange={(value) => updateGoal(goal.id, { review_content: value })} />
                        <details className="rounded-md border bg-slate-50 p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-blue-800">AI判断の根拠を見る（{goal.ai_evidence_json.length}件）</summary>
                          <div className="mt-3 space-y-2">
                            {goal.ai_evidence_json.length === 0 ? <p className="text-sm text-slate-500">根拠として紐づいた訪問記録はありません。</p> : goal.ai_evidence_json.map((evidenceId) => {
                              const visit = evidenceById.get(evidenceId);
                              return <div key={evidenceId} className="rounded border bg-white p-3 text-sm"><div className="font-semibold">{visit ? `${visit.date} ${visit.start_time ?? ""}` : evidenceId}</div><div className="mt-1 whitespace-pre-wrap text-slate-700">{visit?.note ?? "現在の参照期間では記録を表示できません"}</div></div>;
                            })}
                          </div>
                        </details>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">事業所より</h2>
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                この欄はAI生成されません。共通お知らせまたは手入力内容だけを使用します。
              </div>
              <textarea value={draft.office_notice} disabled={!canManage} onChange={(event) => updateDraft({ office_notice: event.target.value })} rows={7} className="mt-3 w-full rounded-md border px-3 py-2 disabled:bg-slate-100" />
            </section>

            {pdfReady && (
              <section className="rounded-xl border bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold">確定PDF</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => void showPdf("view")} className="inline-flex items-center gap-2 rounded-md border px-3 py-2"><Eye size={17} />PDF表示</button>
                  <button onClick={() => void showPdf("download")} className="inline-flex items-center gap-2 rounded-md border px-3 py-2"><Download size={17} />ダウンロード</button>
                  <button onClick={() => void showPdf("print")} className="inline-flex items-center gap-2 rounded-md border px-3 py-2"><Printer size={17} />印刷</button>
                  {currentPdfDriveUrl && <a href={currentPdfDriveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">Google Driveで開く</a>}
                </div>
                {previousPdfSnapshots.length > 0 && (
                  <div className="mt-4 border-t pt-3 text-sm">
                    <div className="font-semibold">過去の確定PDF</div>
                    {previousPdfSnapshots.map((snapshot) => {
                      const driveUrl =
                        typeof snapshot.drive_web_view_link === "string"
                          ? snapshot.drive_web_view_link
                          : "";
                      return (
                        <div key={String(snapshot.id)} className="mt-2 flex flex-wrap items-center gap-3">
                          <button onClick={() => void showPdf("view", String(snapshot.id))} className="text-blue-700 hover:underline">v{String(snapshot.version_no)}・{new Date(String(snapshot.created_at)).toLocaleString("ja-JP")}</button>
                          {driveUrl && <a href={driveUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">Google Drive</a>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <section className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">FAX送信履歴</h2>
              {data.fax_history.length === 0 ? <p className="mt-3 text-sm text-slate-500">送信履歴はありません。</p> : (
                <div className="mt-3 overflow-x-auto"><table className="min-w-[750px] w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-left">日時</th><th className="p-2 text-left">送信先</th><th className="p-2 text-left">FAX</th><th className="p-2 text-left">結果</th><th className="p-2 text-left">送信PDF</th></tr></thead><tbody className="divide-y">{data.fax_history.map((history) => <tr key={String(history.id)}><td className="p-2">{history.sent_at ? new Date(String(history.sent_at)).toLocaleString("ja-JP") : new Date(String(history.created_at)).toLocaleString("ja-JP")}</td><td className="p-2">{String(history.destination_name ?? "")}</td><td className="p-2">{String(history.fax_number ?? "")}</td><td className="p-2">{history.status === "accepted" ? "受付済み" : history.status === "request_failed" ? `失敗：${String(history.error_message ?? "")}` : "送信中"}</td><td className="p-2"><button onClick={() => void showPdf("view", String(history.pdf_snapshot_id))} className="text-blue-700 hover:underline">この時送信したPDF</button></td></tr>)}</tbody></table></div>
              )}
            </section>

            {canManage && data.fax_history.length === 0 && (
              <div className="flex justify-end"><button onClick={removeMonitoring} disabled={Boolean(working)} className="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"><Trash2 size={16} />削除</button></div>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <section className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="font-bold">生成前の参照情報</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div><dt className="text-slate-500">プラン</dt><dd>{data.context.summary.plan_period ?? "なし"}</dd></div>
                <div><dt className="text-slate-500">訪問記録</dt><dd>{data.context.summary.visit_count}件</dd></div>
                <div><dt className="text-slate-500">前回モニタリング</dt><dd>{data.context.summary.previous_monitoring_date ?? "なし"}</dd></div>
                <div><dt className="text-slate-500">担当者</dt><dd>{data.context.summary.care_manager_name ?? "未登録"}</dd></div>
                <div><dt className="text-slate-500">FAX</dt><dd>{data.context.summary.fax_number ?? "未登録"}</dd></div>
              </dl>
              {data.context.warnings.length > 0 && <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} />確認事項</div><ul className="mt-2 list-disc pl-5">{data.context.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{!data.context.fax_target.fax_number && <Link href={`/portal/kaipoke-info-detail/${clientInfoId}`} className="mt-3 inline-block font-semibold text-blue-700 hover:underline">送信先情報を確認</Link>}</div>}
            </section>

            <SourceDetails title="基本情報"><pre className="whitespace-pre-wrap text-xs">{formatJson(data.context.client)}</pre></SourceDetails>
            <SourceDetails title="最新アセスメント"><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{data.context.assessment ? formatJson(data.context.assessment) : "アセスメントなし"}</pre></SourceDetails>
            <SourceDetails title="対象期間のプラン"><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{data.context.plan ? formatJson({ ...data.context.plan, goals: data.context.goals }) : "有効なプランなし"}</pre></SourceDetails>
            <SourceDetails title={`訪問記録 ${data.context.visit_records.length}件`}>
              <div className="max-h-96 space-y-2 overflow-auto">{data.context.visit_records.length === 0 ? <p className="text-sm text-slate-500">記録なし</p> : data.context.visit_records.map((visit) => <div key={visit.evidence_id} className="rounded border p-2 text-xs"><div className="font-semibold">{visit.date} {visit.start_time ?? ""}・{visit.service_code ?? "サービス未設定"}</div><div className="mt-1 whitespace-pre-wrap">{visit.note}</div></div>)}</div>
            </SourceDetails>
            <SourceDetails title="前回モニタリング"><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{data.context.previous_monitorings.length ? formatJson(data.context.previous_monitorings) : "前回モニタリングなし"}</pre></SourceDetails>
          </aside>
        </div>
      </div>
    </main>
  );
}

function TextArea(props: {
  label: string;
  value: string;
  disabled: boolean;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {props.label}
      <textarea
        value={props.value}
        disabled={props.disabled}
        rows={props.rows ?? 4}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1 w-full rounded-md border px-3 py-2 font-normal disabled:bg-slate-100"
      />
    </label>
  );
}

function SourceDetails(props: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border bg-white p-4 shadow-sm">
      <summary className="cursor-pointer font-bold">{props.title}</summary>
      <div className="mt-3 border-t pt-3">{props.children}</div>
    </details>
  );
}
