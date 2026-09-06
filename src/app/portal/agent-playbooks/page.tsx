"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MessageSquareText,
  Pencil,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useRoleContext } from "@/context/RoleContext";
import { supabase } from "@/lib/supabaseClient";
import {
  ACTION_LABELS,
  APPROVER_SCOPE_LABELS,
  CATEGORY_LABELS,
  CONFIRMATION_MODE_LABELS,
  EMPTY_PLAYBOOK,
  EXECUTION_MODE_LABELS,
  PLAYBOOK_TEMPLATES,
  ROOM_SCOPE_LABELS,
  TRIGGER_MODE_LABELS,
} from "@/lib/agent-playbooks/catalog";
import { AGENT_ACTIONS } from "@/lib/agent-playbooks/types";
import type { AgentAction, AgentPlaybook, AgentPlaybookInput } from "@/lib/agent-playbooks/types";

function cloneInput(input: AgentPlaybookInput): AgentPlaybookInput {
  return { ...input, trigger_examples: [...input.trigger_examples], allowed_actions: [...input.allowed_actions] };
}

function toInput(playbook: AgentPlaybook): AgentPlaybookInput {
  return {
    name: playbook.name,
    description: playbook.description ?? "",
    category: playbook.category,
    room_scope: playbook.room_scope,
    situation: playbook.situation,
    instructions: playbook.instructions,
    trigger_examples: playbook.trigger_examples ?? [],
    allowed_actions: playbook.allowed_actions ?? [],
    context_message_limit: playbook.context_message_limit,
    context_minutes: playbook.context_minutes,
    confirmation_mode: playbook.confirmation_mode,
    approver_scope: playbook.approver_scope,
    session_ttl_minutes: playbook.session_ttl_minutes,
    is_enabled: playbook.is_enabled,
  };
}

async function authHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("ログイン状態を確認できません。再ログインしてください。");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

export default function AgentPlaybooksPage() {
  const { role, loading: roleLoading } = useRoleContext();
  const [playbooks, setPlaybooks] = useState<AgentPlaybook[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AgentPlaybookInput>(cloneInput(EMPTY_PLAYBOOK));
  const [examplesText, setExamplesText] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const canManage = role === "manager" || role === "admin";

  const loadPlaybooks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/agent-playbooks", { headers: await authHeaders(), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "業務ルールを読み込めませんでした。");
      setPlaybooks(body.playbooks ?? []);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "業務ルールを読み込めませんでした。" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roleLoading && canManage) void loadPlaybooks();
    if (!roleLoading && !canManage) setLoading(false);
  }, [roleLoading, canManage, loadPlaybooks]);

  const fixedPlaybooks = useMemo(() => playbooks.filter((item) => item.is_locked), [playbooks]);
  const editablePlaybooks = useMemo(() => playbooks.filter((item) => !item.is_locked), [playbooks]);

  function startNew(input = EMPTY_PLAYBOOK) {
    const next = cloneInput(input);
    setEditingId(null);
    setForm(next);
    setExamplesText(next.trigger_examples.join("\n"));
    setShowForm(true);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(playbook: AgentPlaybook) {
    const next = toInput(playbook);
    setEditingId(playbook.id);
    setForm(next);
    setExamplesText(next.trigger_examples.join("\n"));
    setShowForm(true);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleAction(action: AgentAction) {
    setForm((current) => ({
      ...current,
      allowed_actions: current.allowed_actions.includes(action)
        ? current.allowed_actions.filter((item) => item !== action)
        : [...current.allowed_actions, action],
    }));
  }

  async function persist(input: AgentPlaybookInput, id?: string) {
    const response = await fetch(id ? `/api/agent-playbooks/${id}` : "/api/agent-playbooks", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...await authHeaders() },
      body: JSON.stringify(input),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "業務ルールを保存できませんでした。");
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const input = {
        ...form,
        trigger_examples: examplesText.split("\n").map((value) => value.trim()).filter(Boolean),
      };
      await persist(input, editingId ?? undefined);
      setNotice({ kind: "success", text: editingId ? "業務ルールを更新しました。" : "業務ルールを追加しました。最初は停止状態での確認がおすすめです。" });
      setEditingId(null);
      setShowForm(false);
      setForm(cloneInput(EMPTY_PLAYBOOK));
      setExamplesText("");
      await loadPlaybooks();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "業務ルールを保存できませんでした。" });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(playbook: AgentPlaybook) {
    setSavingId(playbook.id);
    setNotice(null);
    try {
      await persist({ ...toInput(playbook), is_enabled: !playbook.is_enabled }, playbook.id);
      setNotice({ kind: "success", text: `${playbook.name}を${playbook.is_enabled ? "停止" : "有効化"}しました。` });
      await loadPlaybooks();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "状態を変更できませんでした。" });
    } finally {
      setSavingId(null);
    }
  }

  if (roleLoading) return <main className="p-6 text-sm text-slate-600">権限を確認しています…</main>;
  if (!canManage) return <main className="p-6 text-red-700">このページはマネジャー・管理者のみ利用できます。</main>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-slate-900 md:p-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Bot size={15} aria-hidden /> スマートアイさん
          </div>
          <h1 className="text-2xl font-bold">AI業務ルール</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            「どんな場面で」「何をしてほしいか」を登録します。新しい会話はLINE WORKSで @すまーとアイさん とメンションされたときに始まります。
          </p>
        </div>
        <button type="button" onClick={() => startNew()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
          <Plus size={18} aria-hidden /> 新しいルールを追加
        </button>
      </header>

      {notice && <div className={`rounded-lg border px-4 py-3 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.text}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">登録ルール</div><div className="mt-1 text-2xl font-bold">{playbooks.length}<span className="ml-1 text-sm font-normal text-slate-500">件</span></div></div>
        <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">稼働中</div><div className="mt-1 text-2xl font-bold text-emerald-700">{playbooks.filter((item) => item.is_enabled).length}<span className="ml-1 text-sm font-normal text-slate-500">件</span></div></div>
        <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold text-slate-500">固定処理</div><div className="mt-1 text-2xl font-bold text-indigo-700">{fixedPlaybooks.length}<span className="ml-1 text-sm font-normal text-slate-500">件</span></div></div>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={22} aria-hidden />
          <div><h2 className="font-semibold text-emerald-950">実行できる操作をルールごとに限定します</h2><p className="mt-1 text-sm leading-6 text-emerald-900">シフト削除などの変更操作は、対象を表示して本人が確認した場合だけ実行します。文章だけで任意のデータ操作を許可することはありません。</p></div>
        </div>
      </section>

      {showForm && (
        <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{editingId ? "業務ルールを編集" : "新しい業務ルール"}</h2><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50">閉じる</button></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium md:col-span-2">ルール名<span className="text-red-600"> *</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="例：利用者様のシフトキャンセル" /></label>
            <label className="text-sm font-medium">カテゴリ<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as AgentPlaybookInput["category"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm font-medium">対象の部屋<select value={form.room_scope} onChange={(event) => setForm({ ...form, room_scope: event.target.value as AgentPlaybookInput["room_scope"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">{Object.entries(ROOM_SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm font-medium md:col-span-2">説明<textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
            <label className="text-sm font-medium md:col-span-2">どんな場面で<span className="text-red-600"> *</span><textarea value={form.situation} onChange={(event) => setForm({ ...form, situation: event.target.value })} maxLength={2000} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="どの部屋で、どのような依頼があった場合か" /></label>
            <label className="text-sm font-medium md:col-span-2">どのようなことをしてほしいか<span className="text-red-600"> *</span><textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} maxLength={5000} rows={5} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="候補の提示、聞き返し、確認、実行、完了報告の順で記入できます" /></label>
            <label className="text-sm font-medium md:col-span-2">依頼の例（1行に1つ）<textarea value={examplesText} onChange={(event) => setExamplesText(event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="来週火曜日のシフトがキャンセルになりました" /></label>
            <fieldset className="md:col-span-2"><legend className="text-sm font-medium">このルールに許可する操作</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{AGENT_ACTIONS.filter((action) => action !== "lineworks.send_unhandled_reminder" && action !== "lineworks.leave_self").map((action) => <label key={action} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={form.allowed_actions.includes(action)} onChange={() => toggleAction(action)} className="h-4 w-4" />{ACTION_LABELS[action]}</label>)}</div></fieldset>
            <label className="text-sm font-medium">参照する直前メッセージ数<input type="number" min={0} max={50} value={form.context_message_limit} onChange={(event) => setForm({ ...form, context_message_limit: Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
            <label className="text-sm font-medium">参照する時間（分）<input type="number" min={0} max={180} value={form.context_minutes} onChange={(event) => setForm({ ...form, context_minutes: Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
            <label className="text-sm font-medium">実行前の確認<select value={form.confirmation_mode} onChange={(event) => setForm({ ...form, confirmation_mode: event.target.value as AgentPlaybookInput["confirmation_mode"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">{Object.entries(CONFIRMATION_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm font-medium">確認できる人<select value={form.approver_scope} onChange={(event) => setForm({ ...form, approver_scope: event.target.value as AgentPlaybookInput["approver_scope"] })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">{Object.entries(APPROVER_SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm font-medium">会話を続ける時間（分）<input type="number" min={1} max={60} value={form.session_ttl_minutes} onChange={(event) => setForm({ ...form, session_ttl_minutes: Number(event.target.value) })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium"><input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm({ ...form, is_enabled: event.target.checked })} className="h-5 w-5" />保存後すぐに有効化する</label>
          </div>
          {form.is_enabled && <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden />新しい実行基盤の接続後、このルールが会話で使われます。最初は停止状態で保存し、内容を確認してから有効化してください。</div>}
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "保存中…" : editingId ? "変更を保存" : "ルールを追加"}</button><button type="button" disabled={saving} onClick={() => setShowForm(false)} className="rounded-lg border px-5 py-2.5 text-sm hover:bg-slate-50">キャンセル</button></div>
        </section>
      )}

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold">残す固定処理</h2><p className="mt-1 text-sm text-slate-600">未対応リマインドと退出処理は保護し、この画面から停止・変更できないようにしています。</p></div>
        <div className="grid gap-4 lg:grid-cols-2">{fixedPlaybooks.map((playbook) => <article key={playbook.id} className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{playbook.name}</h3><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">稼働中</span></div><p className="mt-1 text-sm text-slate-600">{playbook.description}</p></div><LockKeyhole className="shrink-0 text-indigo-600" size={20} aria-label="固定処理" /></div><dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-500">開始</dt><dd className="mt-0.5">{TRIGGER_MODE_LABELS[playbook.trigger_mode]}</dd></div><div><dt className="text-xs font-semibold text-slate-500">処理方式</dt><dd className="mt-0.5">{EXECUTION_MODE_LABELS[playbook.execution_mode]}</dd></div></dl><div className="mt-3 text-sm"><span className="font-semibold">処理：</span>{playbook.instructions}</div></article>)}</div>
      </section>

      {editablePlaybooks.length === 0 && !loading && !showForm && (
        <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><MessageSquareText className="text-indigo-600" size={22} aria-hidden /><h2 className="font-bold">おすすめルールから始める</h2></div><p className="mt-1 text-sm text-slate-600">選んだあと、場面と手順を確認して保存できます。最初は停止状態です。</p><div className="mt-4 grid gap-3 md:grid-cols-2">{PLAYBOOK_TEMPLATES.map((template) => <button type="button" key={template.key} onClick={() => startNew(template.input)} className="rounded-lg border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50"><div className="font-semibold">{template.label}</div><div className="mt-1 text-sm leading-5 text-slate-600">{template.summary}</div><div className="mt-3 text-xs font-semibold text-indigo-700">この設定を使う →</div></button>)}</div></section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">登録した会話ルール</h2><p className="mt-1 text-sm text-slate-600">セッション開始後は、設定した時間内なら毎回メンションしなくても会話を続けられます。</p></div>{loading && <span className="text-sm text-slate-500">読み込み中…</span>}</div>
        {!loading && editablePlaybooks.length === 0 && <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">まだ会話ルールはありません。おすすめルールまたは「新しいルールを追加」から登録できます。</div>}
        <div className="grid gap-4 lg:grid-cols-2">{editablePlaybooks.map((playbook) => <article key={playbook.id} className={`rounded-xl border bg-white p-4 shadow-sm ${playbook.is_enabled ? "border-emerald-200" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{playbook.name}</h3><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${playbook.is_enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{playbook.is_enabled ? "稼働中" : "停止中"}</span><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{CATEGORY_LABELS[playbook.category]}</span></div><p className="mt-1 text-sm text-slate-600">{playbook.description || playbook.situation}</p></div><button type="button" onClick={() => startEdit(playbook)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"><Pencil size={15} aria-hidden />編集</button></div><dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-500">開始</dt><dd className="mt-0.5 flex items-center gap-1.5"><MessageSquareText size={15} className="text-slate-400" />@すまーとアイさん</dd></div><div><dt className="text-xs font-semibold text-slate-500">対象</dt><dd className="mt-0.5">{ROOM_SCOPE_LABELS[playbook.room_scope]}</dd></div><div><dt className="text-xs font-semibold text-slate-500">確認</dt><dd className="mt-0.5">{CONFIRMATION_MODE_LABELS[playbook.confirmation_mode]}</dd></div><div><dt className="text-xs font-semibold text-slate-500">会話時間</dt><dd className="mt-0.5 flex items-center gap-1.5"><Clock3 size={15} className="text-slate-400" />{playbook.session_ttl_minutes}分</dd></div></dl><div className="mt-3 text-sm"><span className="font-semibold">場面：</span><span className="text-slate-700">{playbook.situation}</span></div><div className="mt-3 flex flex-wrap gap-2">{playbook.allowed_actions.map((action) => <span key={action} className="rounded-full border bg-slate-50 px-2.5 py-1 text-xs text-slate-700">{ACTION_LABELS[action]}</span>)}</div><div className="mt-4 flex items-center justify-between border-t pt-3"><div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle2 size={15} aria-hidden />確認・権限チェック適用</div><button type="button" disabled={savingId === playbook.id} onClick={() => void toggle(playbook)} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${playbook.is_enabled ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{savingId === playbook.id ? "変更中…" : playbook.is_enabled ? "停止する" : "有効にする"}</button></div></article>)}</div>
      </section>
    </main>
  );
}
