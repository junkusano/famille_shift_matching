"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { knowledgeApi } from "@/components/knowledge/api";
import type { KnowledgeItem, KnowledgeSource } from "@/lib/knowledge/types";

type ItemResponse = { ok: true; items: KnowledgeItem[]; total: number; page?: number; perPage?: number };
type SourceResponse = { ok: true; sources: KnowledgeSource[] };

type FormState = {
  knowledge_type: string;
  title: string;
  summary: string;
  content: string;
  source_url: string;
  drive_url: string;
  occurred_at: string;
  period_start: string;
  period_end: string;
  category: string;
  tags: string;
  importance: number;
  confidence: string;
  related_departments: string;
  related_services: string;
  privacy_level: 0 | 1 | 2 | 3;
  publishability: "public" | "anonymize" | "internal_only" | "never_publish";
  public_summary: string;
  contains_personal_data: boolean;
  redaction_status: "not_required" | "required" | "in_progress" | "completed" | "rejected";
  review_status: "draft" | "needs_review" | "approved" | "rejected" | "superseded";
  verification_status: "unverified" | "partially_verified" | "verified" | "disputed";
};

const EMPTY_FORM: FormState = {
  knowledge_type: "manual",
  title: "",
  summary: "",
  content: "",
  source_url: "",
  drive_url: "",
  occurred_at: "",
  period_start: "",
  period_end: "",
  category: "",
  tags: "",
  importance: 3,
  confidence: "",
  related_departments: "",
  related_services: "",
  privacy_level: 1,
  publishability: "internal_only",
  public_summary: "",
  contains_personal_data: false,
  redaction_status: "not_required",
  review_status: "draft",
  verification_status: "unverified",
};

const splitList = (value: string) => value.split(/[、,\n]+/).map((item) => item.trim()).filter(Boolean);
const datetimeLocal = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

function itemToForm(item: KnowledgeItem): FormState {
  return {
    knowledge_type: item.knowledge_type,
    title: item.title,
    summary: item.summary,
    content: item.content ?? "",
    source_url: item.source_url ?? "",
    drive_url: item.drive_url ?? "",
    occurred_at: datetimeLocal(item.occurred_at),
    period_start: item.period_start ?? "",
    period_end: item.period_end ?? "",
    category: item.category ?? "",
    tags: item.tags.join("、"),
    importance: item.importance,
    confidence: item.confidence === null ? "" : String(item.confidence),
    related_departments: item.related_departments.join("、"),
    related_services: item.related_services.join("、"),
    privacy_level: item.privacy_level,
    publishability: item.publishability,
    public_summary: item.public_summary ?? "",
    contains_personal_data: item.contains_personal_data,
    redaction_status: item.redaction_status as FormState["redaction_status"],
    review_status: item.review_status,
    verification_status: item.verification_status,
  };
}

function statusClass(status: string) {
  if (status === "approved" || status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "needs_review" || status === "anonymize") return "bg-amber-100 text-amber-800";
  if (status === "rejected" || status === "never_publish") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

export function KnowledgeItemsAdmin() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const loadSources = useCallback(async () => {
    const response = await knowledgeApi<SourceResponse>("/api/admin/knowledge/sources");
    setSources(response.sources);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      if (query.trim()) {
        const response = await knowledgeApi<ItemResponse>("/api/admin/knowledge/search", {
          method: "POST",
          body: JSON.stringify({ query: query.trim() }),
        });
        setItems(response.items);
        setTotal(response.total);
      } else {
        const params = new URLSearchParams({ page: String(page), perPage: "30" });
        if (sourceId) params.set("source_id", sourceId);
        if (reviewStatus) params.set("review_status", reviewStatus);
        if (privacyLevel) params.set("privacy_level", privacyLevel);
        const response = await knowledgeApi<ItemResponse>(`/api/admin/knowledge/items?${params}`);
        setItems(response.items);
        setTotal(response.total);
      }
    } catch (error) {
      setItems([]);
      setMessage(error instanceof Error ? error.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [page, privacyLevel, query, reviewStatus, sourceId]);

  useEffect(() => { void loadSources().catch(() => undefined); }, [loadSources]);
  useEffect(() => { void loadItems(); }, [loadItems]);

  const pageCount = Math.max(1, Math.ceil(total / 30));
  const publicationWarning = useMemo(() => {
    if (form.publishability !== "public") return null;
    if (form.privacy_level !== 0) return "公開可能にするにはprivacy level 0が必要です。";
    if (form.contains_personal_data) return "個人情報を含むため公開できません。";
    if (form.review_status !== "approved") return "公開可能にするにはレビュー承認が必要です。";
    if (!form.public_summary.trim()) return "公開用要約が必要です。";
    return null;
  }, [form]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openEdit(item: KnowledgeItem) {
    setEditingId(item.id);
    setForm(itemToForm(item));
    setEditorOpen(true);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        ...form,
        tags: splitList(form.tags),
        related_departments: splitList(form.related_departments),
        related_services: splitList(form.related_services),
        confidence: form.confidence === "" ? null : Number(form.confidence),
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : null,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        source_url: form.source_url || null,
        drive_url: form.drive_url || null,
        category: form.category || null,
        public_summary: form.public_summary || null,
      };
      await knowledgeApi(editingId ? `/api/admin/knowledge/items/${editingId}` : "/api/admin/knowledge/items", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setEditorOpen(false);
      setMessage(editingId ? "ナレッジを更新しました。" : "ナレッジを追加しました。");
      await loadItems();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="flex-1 text-sm font-medium text-slate-700">キーワード
            <div className="mt-1 flex gap-2"><Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadItems(); }} placeholder="タイトル・要約・タグを検索" /><Button type="button" variant="outline" onClick={() => void loadItems()}><Search size={16} /></Button></div>
          </label>
          <label className="text-sm font-medium text-slate-700">情報源
            <select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setPage(1); }} className="mt-1 block min-w-52 rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">すべて</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
          </label>
          <label className="text-sm font-medium text-slate-700">確認状態
            <select value={reviewStatus} onChange={(event) => { setReviewStatus(event.target.value); setPage(1); }} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">すべて</option><option value="draft">下書き</option><option value="needs_review">要確認</option><option value="approved">承認済み</option><option value="rejected">却下</option><option value="superseded">旧版</option></select>
          </label>
          <label className="text-sm font-medium text-slate-700">Privacy
            <select value={privacyLevel} onChange={(event) => { setPrivacyLevel(event.target.value); setPage(1); }} className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">すべて</option><option value="0">0 公開</option><option value="1">1 社内</option><option value="2">2 機密</option><option value="3">3 個人情報</option></select>
          </label>
          <Button type="button" onClick={openCreate}><Plus size={16} className="mr-2" />ナレッジ追加</Button>
        </div>
      </div>

      {message && <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">更新日時</th><th className="px-4 py-3">タイトル・要約</th><th className="px-4 py-3">種類</th><th className="px-4 py-3">情報源</th><th className="px-4 py-3">安全性</th><th className="px-4 py-3">確認</th><th className="px-4 py-3">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">読み込み中…</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">該当するナレッジはありません。</td></tr> : items.map((item) => (
              <tr key={item.id} className="align-top hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(item.updated_at)}</td>
                <td className="max-w-xl px-4 py-3"><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 line-clamp-2 text-slate-600">{item.summary}</p><div className="mt-2 flex flex-wrap gap-1">{item.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tag}</span>)}</div></td>
                <td className="px-4 py-3"><p>{item.knowledge_type}</p><p className="text-xs text-slate-500">{item.category || "—"}</p></td>
                <td className="px-4 py-3">{item.primary_source?.name ?? "手動"}</td>
                <td className="px-4 py-3"><p>Level {item.privacy_level}</p><span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${statusClass(item.publishability)}`}>{item.publishability}</span></td>
                <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs ${statusClass(item.review_status)}`}>{item.review_status}</span><p className="mt-1 text-xs text-slate-500">{item.verification_status}</p></td>
                <td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil size={14} className="mr-1" />編集</Button>{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded border px-2 text-slate-600"><ExternalLink size={14} /></a>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!query.trim() && <div className="flex items-center justify-between text-sm text-slate-600"><span>{total}件</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>前へ</Button><span>{page} / {pageCount}</span><Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>次へ</Button></div></div>}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "ナレッジを編集" : "ナレッジを追加"}</DialogTitle><DialogDescription>公開可否・個人情報・確認状態を必ず確認してください。</DialogDescription></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">タイトル<Input className="mt-1" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label className="text-sm font-medium">種類<Input className="mt-1" value={form.knowledge_type} onChange={(event) => setForm({ ...form, knowledge_type: event.target.value })} placeholder="lesson / decision / fact" /></label>
            <label className="text-sm font-medium md:col-span-2">要約<Textarea className="mt-1 min-h-24" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
            <label className="text-sm font-medium md:col-span-2">本文<Textarea className="mt-1 min-h-40" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label>
            <label className="text-sm font-medium">カテゴリ<Input className="mt-1" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
            <label className="text-sm font-medium">タグ（読点・カンマ区切り）<Input className="mt-1" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></label>
            <label className="text-sm font-medium">関連部署<Input className="mt-1" value={form.related_departments} onChange={(event) => setForm({ ...form, related_departments: event.target.value })} /></label>
            <label className="text-sm font-medium">関連サービス<Input className="mt-1" value={form.related_services} onChange={(event) => setForm({ ...form, related_services: event.target.value })} /></label>
            <label className="text-sm font-medium">原本URL<Input className="mt-1" value={form.source_url} onChange={(event) => setForm({ ...form, source_url: event.target.value })} /></label>
            <label className="text-sm font-medium">DriveレポートURL<Input className="mt-1" value={form.drive_url} onChange={(event) => setForm({ ...form, drive_url: event.target.value })} /></label>
            <label className="text-sm font-medium">Privacy level<select className="mt-1 block w-full rounded-md border px-3 py-2" value={form.privacy_level} onChange={(event) => setForm({ ...form, privacy_level: Number(event.target.value) as FormState["privacy_level"] })}><option value={0}>0 公開情報</option><option value={1}>1 社内一般</option><option value={2}>2 社内機密</option><option value={3}>3 個人情報</option></select></label>
            <label className="text-sm font-medium">公開可否<select className="mt-1 block w-full rounded-md border px-3 py-2" value={form.publishability} onChange={(event) => setForm({ ...form, publishability: event.target.value as FormState["publishability"] })}><option value="public">public</option><option value="anonymize">anonymize</option><option value="internal_only">internal_only</option><option value="never_publish">never_publish</option></select></label>
            <label className="text-sm font-medium">確認状態<select className="mt-1 block w-full rounded-md border px-3 py-2" value={form.review_status} onChange={(event) => setForm({ ...form, review_status: event.target.value as FormState["review_status"] })}><option value="draft">下書き</option><option value="needs_review">要確認</option><option value="approved">承認済み</option><option value="rejected">却下</option><option value="superseded">旧版</option></select></label>
            <label className="text-sm font-medium">検証状態<select className="mt-1 block w-full rounded-md border px-3 py-2" value={form.verification_status} onChange={(event) => setForm({ ...form, verification_status: event.target.value as FormState["verification_status"] })}><option value="unverified">未検証</option><option value="partially_verified">一部検証</option><option value="verified">検証済み</option><option value="disputed">要再確認</option></select></label>
            <label className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium"><input type="checkbox" checked={form.contains_personal_data} onChange={(event) => setForm({ ...form, contains_personal_data: event.target.checked })} />個人情報を含む</label>
            <label className="text-sm font-medium">匿名化状態<select className="mt-1 block w-full rounded-md border px-3 py-2" value={form.redaction_status} onChange={(event) => setForm({ ...form, redaction_status: event.target.value as FormState["redaction_status"] })}><option value="not_required">不要</option><option value="required">必要</option><option value="in_progress">処理中</option><option value="completed">完了</option><option value="rejected">不可</option></select></label>
            <label className="text-sm font-medium md:col-span-2">公開用要約<Textarea className="mt-1 min-h-24" value={form.public_summary} onChange={(event) => setForm({ ...form, public_summary: event.target.value })} /></label>
            <label className="text-sm font-medium">重要度（1〜5）<Input className="mt-1" type="number" min={1} max={5} value={form.importance} onChange={(event) => setForm({ ...form, importance: Number(event.target.value) })} /></label>
            <label className="text-sm font-medium">信頼度（0〜1）<Input className="mt-1" type="number" min={0} max={1} step={0.01} value={form.confidence} onChange={(event) => setForm({ ...form, confidence: event.target.value })} /></label>
            <label className="text-sm font-medium">発生日時<Input className="mt-1" type="datetime-local" value={form.occurred_at} onChange={(event) => setForm({ ...form, occurred_at: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2"><label className="text-sm font-medium">期間開始<Input className="mt-1" type="date" value={form.period_start} onChange={(event) => setForm({ ...form, period_start: event.target.value })} /></label><label className="text-sm font-medium">期間終了<Input className="mt-1" type="date" value={form.period_end} onChange={(event) => setForm({ ...form, period_end: event.target.value })} /></label></div>
          </div>
          {publicationWarning && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{publicationWarning}</div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>キャンセル</Button><Button type="button" disabled={saving || !form.title.trim() || !form.summary.trim() || Boolean(publicationWarning)} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

