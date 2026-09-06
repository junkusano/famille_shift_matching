"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, Bot, CheckCircle2, Clock3, Pencil, Play, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRoleContext } from "@/context/RoleContext";
import {
  APPROVAL_MODE_LABELS,
  AUTOMATION_TEMPLATES,
  DESTINATION_LABELS,
  TASK_TYPE_LABELS,
  TRIGGER_TYPE_LABELS,
} from "@/lib/knowledge-automation/catalog";
import type {
  AutomationApprovalMode,
  AutomationDestination,
  AutomationTaskType,
  AutomationTriggerType,
  KnowledgeAutomationTask,
  KnowledgeAutomationTaskInput,
} from "@/lib/knowledge-automation/types";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_FORM: KnowledgeAutomationTaskInput = {
  name: "",
  description: "",
  task_type: "custom",
  trigger_type: "manual",
  schedule: {},
  destination: "none",
  approval_mode: "review_required",
  condition_summary: "",
  settings: {},
  is_enabled: false,
};

function cloneInput(input: KnowledgeAutomationTaskInput): KnowledgeAutomationTaskInput {
  return {
    ...input,
    schedule: { ...input.schedule, times: input.schedule.times ? [...input.schedule.times] : undefined },
    settings: { ...(input.settings ?? {}) },
  };
}

function taskInput(task: KnowledgeAutomationTask): KnowledgeAutomationTaskInput {
  return {
    name: task.name,
    description: task.description ?? "",
    task_type: task.task_type,
    trigger_type: task.trigger_type,
    schedule: { ...task.schedule, times: task.schedule.times ? [...task.schedule.times] : undefined },
    destination: task.destination,
    approval_mode: task.approval_mode,
    condition_summary: task.condition_summary ?? "",
    settings: { ...task.settings },
    is_enabled: task.is_enabled,
  };
}

function scheduleLabel(task: Pick<KnowledgeAutomationTaskInput, "trigger_type" | "schedule">) {
  if (task.trigger_type === "interval") return `${task.schedule.minutes ?? "—"}分ごと`;
  if (task.trigger_type === "daily") return `毎日 ${(task.schedule.times ?? []).join("・") || "時刻未設定"}`;
  if (task.trigger_type === "monthly") return `毎月${task.schedule.day ?? "—"}日 ${task.schedule.time ?? "—"}`;
  if (task.trigger_type === "event") return "新しい対象情報を受け取ったとき";
  return "手動実行";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function authHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("ログイン状態を確認できません。再ログインしてください。");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

export default function KnowledgeAutomationPage() {
  const { role, loading: roleLoading } = useRoleContext();
  const [tasks, setTasks] = useState<KnowledgeAutomationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<KnowledgeAutomationTaskInput>(cloneInput(EMPTY_FORM));
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const canManage = role === "manager" || role === "admin";

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge-automation/tasks", { headers: await authHeaders(), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "自動化タスクを読み込めませんでした。");
      setTasks(body.tasks ?? []);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "自動化タスクを読み込めませんでした。" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roleLoading && canManage) void loadTasks();
    if (!roleLoading && !canManage) setLoading(false);
  }, [roleLoading, canManage, loadTasks]);

  const stats = useMemo(() => ({
    total: tasks.length,
    enabled: tasks.filter((task) => task.is_enabled).length,
    review: tasks.filter((task) => task.approval_mode === "review_required").length,
  }), [tasks]);

  function startNew(input = EMPTY_FORM) {
    setEditingId(null);
    setForm(cloneInput(input));
    setShowForm(true);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(task: KnowledgeAutomationTask) {
    setEditingId(task.id);
    setForm(taskInput(task));
    setShowForm(true);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function persist(input: KnowledgeAutomationTaskInput, id?: string) {
    const response = await fetch(id ? `/api/knowledge-automation/tasks/${id}` : "/api/knowledge-automation/tasks", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...await authHeaders() },
      body: JSON.stringify(input),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "自動化タスクを保存できませんでした。");
    return body.task as KnowledgeAutomationTask;
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await persist(form, editingId ?? undefined);
      setNotice({ kind: "success", text: editingId ? "自動化タスクを更新しました。" : "自動化タスクを追加しました。" });
      setEditingId(null);
      setShowForm(false);
      setForm(cloneInput(EMPTY_FORM));
      await loadTasks();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "自動化タスクを保存できませんでした。" });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(task: KnowledgeAutomationTask) {
    setSavingId(task.id);
    setNotice(null);
    try {
      await persist({ ...taskInput(task), is_enabled: !task.is_enabled }, task.id);
      setNotice({ kind: "success", text: `${task.name}を${task.is_enabled ? "停止" : "有効化"}しました。` });
      await loadTasks();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "状態を変更できませんでした。" });
    } finally {
      setSavingId(null);
    }
  }

  async function runNow(task: KnowledgeAutomationTask) {
    setRunningId(task.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/knowledge-automation/tasks/${task.id}/run`, {
        method: "POST",
        headers: await authHeaders(),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message ?? body.error ?? "自動化を実行できませんでした。");
      setNotice({ kind: "success", text: body.message ?? "自動化を実行しました。" });
      await loadTasks();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "自動化を実行できませんでした。" });
    } finally {
      setRunningId(null);
    }
  }

  if (roleLoading) return <main className="p-6 text-sm text-slate-600">権限を確認しています…</main>;
  if (!canManage) return <main className="p-6 text-red-700">このページはマネジャー・管理者のみ利用できます。</main>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-slate-900 md:p-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Bot size={15} aria-hidden /> 数値・管理
          </div>
          <h1 className="text-2xl font-bold">ナレッジ活用自動化</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            ナレッジや外部情報を、いつ確認し、どんな条件で、どこへ反映するかを管理します。登録直後は停止状態にして、内容を確認してから有効化できます。
          </p>
        </div>
        <button type="button" onClick={() => startNew()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
          <Plus size={18} aria-hidden /> 新しい自動化を追加
        </button>
      </header>

      {notice && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {notice.text}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">登録タスク</div><div className="mt-1 text-2xl font-bold">{stats.total}<span className="ml-1 text-sm font-normal text-slate-500">件</span></div></div>
        <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">稼働中</div><div className="mt-1 text-2xl font-bold text-emerald-700">{stats.enabled}<span className="ml-1 text-sm font-normal text-slate-500">件</span></div></div>
        <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">人の確認が必要</div><div className="mt-1 text-2xl font-bold text-amber-700">{stats.review}<span className="ml-1 text-sm font-normal text-slate-500">件</span></div></div>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={22} aria-hidden />
          <div>
            <h2 className="font-semibold text-emerald-950">共通の安全チェックは常に有効です</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-900">個人情報・機密情報・不適切表現・著作権・根拠不足を、保存や送信の直前に確認します。この設定は画面から解除できません。</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-emerald-800">
              {["個人情報NG", "コンプライアンス", "根拠確認", "重複防止", "実行履歴"].map((label) => <span key={label} className="rounded-full border border-emerald-300 bg-white/70 px-2.5 py-1">{label}</span>)}
            </div>
          </div>
        </div>
      </section>

      {showForm && (
        <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{editingId ? "自動化タスクを編集" : "新しい自動化タスク"}</h2>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">閉じる</button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium md:col-span-2">タスク名<span className="text-red-600"> *</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="例：台風・大雪のお知らせ" />
            </label>
            <label className="text-sm font-medium">何をするか
              <select value={form.task_type} onChange={(event) => setForm({ ...form, task_type: event.target.value as AutomationTaskType })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">反映先
              <select value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value as AutomationDestination })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                {Object.entries(DESTINATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium md:col-span-2">説明
              <textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="この自動化の目的を入力します" />
            </label>
            {form.task_type === "wordpress_blog" && (
              <div className="md:col-span-2 grid gap-3">
                <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.settings?.allow_external_ai_context === true}
                    onChange={(event) => setForm({
                      ...form,
                      settings: { ...(form.settings ?? {}), allow_external_ai_context: event.target.checked },
                    })}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    <span className="block font-semibold text-amber-950">公開可能な草野思考ログの編集要約を、記事生成のためOpenAI APIへ送ることを許可する</span>
                    <span className="mt-1 block font-normal leading-5 text-amber-900">個人情報を含む項目と内部URLは送信しません。許可しない場合は、外部公開されたRSS実記事だけを使います。</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.settings?.wordpress_featured_image !== false}
                    onChange={(event) => setForm({
                      ...form,
                      settings: { ...(form.settings ?? {}), wordpress_featured_image: event.target.checked },
                    })}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    <span className="block font-semibold text-indigo-950">記事に合うアイキャッチを必ず設定する</span>
                    <span className="mt-1 block font-normal leading-5 text-indigo-900">関連する既存画像があれば再利用し、なければ新しく生成します。画像を用意できないときは、画像なしの記事を作りません。</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.settings?.wordpress_auto_category !== false}
                    onChange={(event) => setForm({
                      ...form,
                      settings: { ...(form.settings ?? {}), wordpress_auto_category: event.target.checked },
                    })}
                    className="mt-0.5 h-5 w-5 shrink-0"
                  />
                  <span>
                    <span className="block font-semibold text-blue-950">WordPressの既存カテゴリから自動選択する</span>
                    <span className="mt-1 block font-normal leading-5 text-blue-900">記事の主題に最も近いカテゴリを一つ設定します。カテゴリを勝手に新設しないため、分類が増えすぎません。</span>
                  </span>
                </label>
              </div>
            )}
            <label className="text-sm font-medium">実行するタイミング
              <select value={form.trigger_type} onChange={(event) => {
                const triggerType = event.target.value as AutomationTriggerType;
                setForm({ ...form, trigger_type: triggerType, schedule: triggerType === "daily" ? { times: ["09:00"] } : {} });
              }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="text-sm font-medium">
              {form.trigger_type === "interval" && <label>確認間隔
                <select value={form.schedule.minutes ?? 15} onChange={(event) => setForm({ ...form, schedule: { minutes: Number(event.target.value) } })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  {[5, 10, 15, 30, 60, 180, 360, 720, 1440].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes}分ごと` : minutes === 60 ? "1時間ごと" : minutes === 1440 ? "1日ごと" : `${minutes / 60}時間ごと`}</option>)}
                </select>
              </label>}
              {form.trigger_type === "daily" && <div>
                <div>実行時刻</div>
                <div className="mt-1 space-y-2">
                  {(form.schedule.times ?? []).map((time, index) => (
                    <div key={`${index}-${time}`} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={time}
                        aria-label={`実行時刻 ${index + 1}`}
                        onChange={(event) => {
                          const times = [...(form.schedule.times ?? [])];
                          times[index] = event.target.value;
                          setForm({ ...form, schedule: { ...form.schedule, times } });
                        }}
                        className="block min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5"
                      />
                      <button
                        type="button"
                        aria-label={`${time || index + 1}を削除`}
                        disabled={(form.schedule.times ?? []).length <= 1}
                        onClick={() => setForm({ ...form, schedule: { ...form.schedule, times: (form.schedule.times ?? []).filter((_, itemIndex) => itemIndex !== index) } })}
                        className="rounded-lg border border-slate-300 p-2.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 size={18} aria-hidden />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={(form.schedule.times ?? []).length >= 12}
                    onClick={() => setForm({ ...form, schedule: { ...form.schedule, times: [...(form.schedule.times ?? []), "12:00"] } })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    <Plus size={16} aria-hidden /> 時刻を追加
                  </button>
                </div>
              </div>}
              {form.trigger_type === "monthly" && <div className="grid grid-cols-2 gap-2">
                <label>毎月何日
                  <input type="number" min={1} max={31} value={form.schedule.day ?? 15} onChange={(event) => setForm({ ...form, schedule: { ...form.schedule, day: Number(event.target.value) } })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" />
                </label>
                <label>時刻
                  <input type="time" value={form.schedule.time ?? "09:00"} onChange={(event) => setForm({ ...form, schedule: { ...form.schedule, time: event.target.value } })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" />
                </label>
              </div>}
              {form.trigger_type === "event" && <div className="mt-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 font-normal text-blue-900">LINE WORKSなどから対象情報を受け取ったときに確認します。</div>}
              {form.trigger_type === "manual" && <div className="mt-1 rounded-lg border bg-slate-50 px-3 py-2.5 font-normal text-slate-600">自動では起動せず、必要なときだけ実行します。</div>}
            </div>
            <label className="text-sm font-medium">承認方法
              <select value={form.approval_mode} onChange={(event) => setForm({ ...form, approval_mode: event.target.value as AutomationApprovalMode })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                {Object.entries(APPROVAL_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium">
              <input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm({ ...form, is_enabled: event.target.checked })} className="h-5 w-5" />
              保存後すぐに有効化する
            </label>
            <label className="text-sm font-medium md:col-span-2">実行する条件
              <textarea value={form.condition_summary ?? ""} onChange={(event) => setForm({ ...form, condition_summary: event.target.value })} maxLength={2_000} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="例：愛知県のサービスエリアに台風や大雪の影響が見込まれる場合" />
            </label>
          </div>

          {form.approval_mode === "automatic" && (
            <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden />
              {form.task_type === "wordpress_blog"
                ? "時刻になるとWordPressへ自動で下書きを作ります。公開はWordPressで内容を確認してから行ってください。"
                : "条件一致後に自動で反映します。最初は停止状態または「人の確認後に実行」での試行をおすすめします。"}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "保存中…" : editingId ? "変更を保存" : "タスクを追加"}</button>
            <button type="button" disabled={saving} onClick={() => { setShowForm(false); setEditingId(null); }} className="rounded-lg border px-5 py-2.5 text-sm hover:bg-slate-50">キャンセル</button>
          </div>
        </section>
      )}

      {!showForm && tasks.length === 0 && !loading && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><BookOpenCheck className="text-indigo-600" size={22} aria-hidden /><h2 className="font-bold">おすすめテンプレートから始める</h2></div>
          <p className="mt-1 text-sm text-slate-600">選んだあと、条件や時刻を確認して保存できます。最初はすべて停止状態です。</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AUTOMATION_TEMPLATES.map((template) => <button type="button" key={template.key} onClick={() => startNew(template.input)} className="rounded-lg border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50"><div className="font-semibold">{template.label}</div><div className="mt-1 text-sm leading-5 text-slate-600">{template.summary}</div><div className="mt-3 text-xs font-semibold text-indigo-700">この設定を使う →</div></button>)}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">登録済みの自動化</h2>{loading && <span className="text-sm text-slate-500">読み込み中…</span>}</div>
        {!loading && tasks.length === 0 && <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">まだ自動化タスクはありません。上のテンプレートまたは「新しい自動化を追加」から登録できます。</div>}
        <div className="grid gap-4 lg:grid-cols-2">
          {tasks.map((task) => (
            <article key={task.id} className={`rounded-xl border bg-white p-4 shadow-sm ${task.is_enabled ? "border-emerald-200" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{task.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${task.is_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{task.is_enabled ? "稼働中" : "停止中"}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{task.description || TASK_TYPE_LABELS[task.task_type]}</p>
                </div>
                <button type="button" onClick={() => startEdit(task)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><Pencil size={15} aria-hidden /> 編集</button>
              </div>
              <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-semibold text-slate-500">タイミング</dt><dd className="mt-0.5 flex items-center gap-1.5"><Clock3 size={15} className="text-slate-400" aria-hidden />{scheduleLabel(task)}</dd></div>
                <div><dt className="text-xs font-semibold text-slate-500">反映先</dt><dd className="mt-0.5">{DESTINATION_LABELS[task.destination]}</dd></div>
                <div><dt className="text-xs font-semibold text-slate-500">承認方法</dt><dd className="mt-0.5">{APPROVAL_MODE_LABELS[task.approval_mode]}</dd></div>
                <div><dt className="text-xs font-semibold text-slate-500">次回予定</dt><dd className="mt-0.5">{task.trigger_type === "event" ? "情報受信時" : formatDate(task.next_run_at)}</dd></div>
              </dl>
              {task.condition_summary && <div className="mt-3 text-sm"><span className="font-semibold">条件：</span><span className="text-slate-700">{task.condition_summary}</span></div>}
              {(task.last_result || task.last_error_message) && (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${task.last_error_message ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
                  <span className="font-semibold">前回：</span>{task.last_error_message ?? task.last_result}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 size={15} aria-hidden />安全チェック適用</div>
                <div className="flex flex-wrap gap-2">
                  {task.task_type === "wordpress_blog" && (
                    <button type="button" disabled={runningId === task.id} onClick={() => void runNow(task)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                      <Play size={15} aria-hidden />{runningId === task.id ? "実行中…" : "今すぐ実行"}
                    </button>
                  )}
                  <button type="button" disabled={savingId === task.id} onClick={() => void toggle(task)} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${task.is_enabled ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{savingId === task.id ? "変更中…" : task.is_enabled ? "停止する" : "有効にする"}</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
