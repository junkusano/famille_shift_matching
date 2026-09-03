"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Plus, RefreshCw, Save, X } from "lucide-react";
import { useRoleContext } from "@/context/RoleContext";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  WordPressEditorKind,
  WordPressPageDetail,
  WordPressPageStatus,
  WordPressPageSummary,
} from "@/lib/wordpress/types";

const PER_PAGE = 20;

type ConnectionState = {
  loading: boolean;
  connected: boolean;
  hostname: string | null;
  error: string | null;
};

type PageForm = {
  title: string;
  content: string;
  slug: string;
  status: WordPressPageStatus;
};

type EditorState = {
  mode: "create" | "edit";
  pageId: number | null;
  form: PageForm;
  original: PageForm;
  editorKind: WordPressEditorKind;
  editable: boolean;
  warning: string | null;
};

class ApiRequestError extends Error {
  readonly payload: Record<string, unknown> | null;

  constructor(message: string, payload: Record<string, unknown> | null) {
    super(message);
    this.name = "ApiRequestError";
    this.payload = payload;
  }
}

const EMPTY_FORM: PageForm = { title: "", content: "", slug: "", status: "draft" };

function messageFrom(value: unknown, fallback: string) {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === "string" && error) return error;
  }
  return fallback;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusClass(status: string) {
  if (status === "publish") return "bg-emerald-100 text-emerald-800";
  if (status === "private") return "bg-violet-100 text-violet-800";
  if (status === "draft") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function formFromPage(page: WordPressPageDetail): PageForm {
  return {
    title: page.title,
    content: page.content,
    slug: page.slug,
    status: ["draft", "publish", "private"].includes(page.status)
      ? (page.status as WordPressPageStatus)
      : "draft",
  };
}

export default function WebsiteAdminPage() {
  const { role, loading: roleLoading } = useRoleContext();
  const [connection, setConnection] = useState<ConnectionState>({
    loading: true,
    connected: false,
    hostname: null,
    error: null,
  });
  const [pages, setPages] = useState<WordPressPageSummary[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const initialLoadStarted = useRef(false);

  const dirty = useMemo(
    () => Boolean(editor && JSON.stringify(editor.form) !== JSON.stringify(editor.original)),
    [editor]
  );

  useEffect(() => {
    if (!dirty) return;
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [dirty]);

  const authenticatedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("ログイン情報を確認できません。再度ログインしてください。");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiRequestError(
        messageFrom(body, "処理に失敗しました。"),
        typeof body === "object" && body !== null ? body : null
      );
    }
    return body;
  }, []);

  const loadPages = useCallback(
    async (page: number) => {
      setListLoading(true);
      try {
        const body = await authenticatedFetch(
          `/api/admin/wordpress/pages?page=${page}&perPage=${PER_PAGE}`
        );
        setPages(body.pages ?? []);
        setCurrentPage(body.page ?? page);
        setTotalPages(Math.max(1, body.totalPages ?? 1));
        setTotal(body.total ?? 0);
      } catch (error) {
        setPages([]);
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "固定ページ一覧を取得できませんでした。",
        });
      } finally {
        setListLoading(false);
      }
    },
    [authenticatedFetch]
  );

  const refresh = useCallback(async () => {
    setConnection((value) => ({ ...value, loading: true, error: null }));
    setNotice(null);
    try {
      const body = await authenticatedFetch("/api/admin/wordpress/status");
      setConnection({
        loading: false,
        connected: true,
        hostname: body.hostname ?? null,
        error: null,
      });
      await loadPages(currentPage);
    } catch (error) {
      setPages([]);
      const errorHostname =
        error instanceof ApiRequestError && typeof error.payload?.hostname === "string"
          ? error.payload.hostname
          : null;
      setConnection((value) => ({
        loading: false,
        connected: false,
        hostname: errorHostname ?? value.hostname,
        error: error instanceof Error ? error.message : "WordPressに接続できませんでした。",
      }));
    }
  }, [authenticatedFetch, currentPage, loadPages]);

  useEffect(() => {
    if (
      !initialLoadStarted.current &&
      !roleLoading &&
      (role === "admin" || role === "manager")
    ) {
      initialLoadStarted.current = true;
      void refresh();
    }
  }, [role, roleLoading, refresh]);

  function canCloseEditor() {
    return !dirty || window.confirm("保存していない変更があります。破棄して閉じますか？");
  }

  function openCreate() {
    if (!canCloseEditor()) return;
    setNotice(null);
    setEditor({
      mode: "create",
      pageId: null,
      form: { ...EMPTY_FORM },
      original: { ...EMPTY_FORM },
      editorKind: "classic",
      editable: true,
      warning: null,
    });
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function openEdit(id: number) {
    if (!canCloseEditor()) return;
    setEditorLoading(true);
    setNotice(null);
    try {
      const body = await authenticatedFetch(`/api/admin/wordpress/pages/${id}`);
      const page = body.page as WordPressPageDetail;
      const form = formFromPage(page);
      setEditor({
        mode: "edit",
        pageId: page.id,
        form,
        original: { ...form },
        editorKind: page.editorKind,
        editable: page.editable,
        warning: page.editWarning,
      });
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "固定ページを開けませんでした。",
      });
    } finally {
      setEditorLoading(false);
    }
  }

  function updateForm<K extends keyof PageForm>(key: K, value: PageForm[K]) {
    setEditor((current) =>
      current ? { ...current, form: { ...current.form, [key]: value } } : current
    );
  }

  async function saveEditor() {
    if (!editor || !editor.editable || saving) return;
    if (!editor.form.title.trim()) {
      setNotice({ kind: "error", text: "タイトルを入力してください。" });
      return;
    }
    if (
      editor.form.status === "publish" &&
      editor.original.status !== "publish" &&
      !window.confirm("この固定ページを公開します。よろしいですか？")
    ) {
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const url =
        editor.mode === "create"
          ? "/api/admin/wordpress/pages"
          : `/api/admin/wordpress/pages/${editor.pageId}`;
      const body = await authenticatedFetch(url, {
        method: editor.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor.form),
      });
      setNotice({ kind: "success", text: body.message ?? "保存しました。" });
      setEditor(null);
      await loadPages(editor.mode === "create" ? 1 : currentPage);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "保存に失敗しました。",
      });
    } finally {
      setSaving(false);
    }
  }

  if (roleLoading) return <main className="p-6">権限を確認しています…</main>;
  if (role !== "admin" && role !== "manager") {
    return <main className="p-6">このページへのアクセス権限がありません。</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <header>
            <h1 className="text-2xl font-bold text-slate-900">Webサイト管理</h1>
            <p className="mt-1 text-sm text-slate-600">
              WordPressの固定ページをMyFamilleから管理します。
            </p>
          </header>
          <Button variant="outline" onClick={() => void refresh()} disabled={connection.loading}>
            <RefreshCw className={connection.loading ? "animate-spin" : ""} />
            再接続
          </Button>
        </div>

        {notice && (
          <div
            role="status"
            className={`rounded-lg border p-3 text-sm ${
              notice.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {notice.text}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">WordPress接続状態</CardTitle>
          </CardHeader>
          <CardContent>
            {connection.loading ? (
              <p className="text-sm text-slate-600">接続を確認しています…</p>
            ) : connection.connected ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                  <span aria-hidden>●</span> 接続OK
                </span>
                <span className="text-sm text-slate-700">{connection.hostname}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-800">
                  <span aria-hidden>●</span> 接続エラー
                </span>
                {connection.hostname && <p className="text-sm text-slate-600">{connection.hostname}</p>}
                <p className="text-sm text-red-700">{connection.error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">固定ページ</CardTitle>
              <p className="mt-1 text-sm text-slate-500">全{total}件</p>
            </div>
            <Button onClick={openCreate} disabled={!connection.connected || listLoading}>
              <Plus /> 新規ページ
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-slate-100 text-left text-slate-700">
                  <tr>
                    <th className="p-3">タイトル</th>
                    <th className="p-3">slug</th>
                    <th className="p-3">status</th>
                    <th className="p-3">更新日時</th>
                    <th className="p-3">page ID</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id} className="border-t bg-white align-middle">
                      <td className="p-3 font-medium text-slate-900">{page.title || "（無題）"}</td>
                      <td className="max-w-64 break-all p-3 text-slate-600">{page.slug || "—"}</td>
                      <td className="p-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(page.status)}`}>
                          {page.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap p-3 text-slate-600">{formatDate(page.modified)}</td>
                      <td className="p-3 tabular-nums text-slate-600">{page.id}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openEdit(page.id)}
                            disabled={editorLoading}
                          >
                            編集
                          </Button>
                          {page.link && (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={page.link} target="_blank" rel="noopener noreferrer">
                                公開ページ <ExternalLink />
                              </a>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!listLoading && pages.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        {connection.connected ? "固定ページがありません。" : "接続後に一覧を表示します。"}
                      </td>
                    </tr>
                  )}
                  {listLoading && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        固定ページを読み込んでいます…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1 || listLoading}
                  onClick={() => void loadPages(currentPage - 1)}
                >
                  前へ
                </Button>
                <span className="text-sm text-slate-600">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages || listLoading}
                  onClick={() => void loadPages(currentPage + 1)}
                >
                  次へ
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {editor && (
          <Card ref={editorRef}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">
                  {editor.mode === "create" ? "新規固定ページ" : `固定ページを編集（ID: ${editor.pageId}）`}
                </CardTitle>
                {editor.mode === "create" && (
                  <p className="mt-1 text-sm text-slate-500">初期状態は下書きです。</p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="編集画面を閉じる"
                onClick={() => canCloseEditor() && setEditor(null)}
              >
                <X />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {editor.warning && (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    editor.editable
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {editor.warning}
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>タイトル</span>
                  <Input
                    value={editor.form.title}
                    onChange={(event) => updateForm("title", event.target.value)}
                    disabled={!editor.editable || saving}
                    maxLength={300}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>slug</span>
                  <Input
                    value={editor.form.slug}
                    onChange={(event) => updateForm("slug", event.target.value)}
                    disabled={!editor.editable || saving}
                    maxLength={200}
                    placeholder="空欄の場合はWordPressが自動生成します"
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm font-medium text-slate-700">
                <span>status</span>
                <select
                  className="h-9 w-full max-w-xs rounded-md border bg-white px-3 text-sm disabled:opacity-50"
                  value={editor.form.status}
                  onChange={(event) => updateForm("status", event.target.value as WordPressPageStatus)}
                  disabled={!editor.editable || saving}
                >
                  <option value="draft">draft（下書き）</option>
                  <option value="publish">publish（公開）</option>
                  <option value="private">private（非公開）</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium text-slate-700">
                <span>本文HTML</span>
                <Textarea
                  className="min-h-[420px] resize-y font-mono text-xs leading-relaxed"
                  value={editor.form.content}
                  onChange={(event) => updateForm("content", event.target.value)}
                  disabled={!editor.editable || saving}
                  spellCheck={false}
                />
              </label>
              <p className="text-xs text-slate-500">
                GutenbergコメントやHTMLを含む本文を、そのまま保存します。内容を確認してから保存してください。
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => canCloseEditor() && setEditor(null)}
                  disabled={saving}
                >
                  キャンセル
                </Button>
                <Button onClick={() => void saveEditor()} disabled={!editor.editable || !dirty || saving}>
                  <Save /> {saving ? "保存しています…" : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
