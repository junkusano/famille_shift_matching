"use client";

import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useRoleContext } from "@/context/RoleContext";
import { supabase } from "@/lib/supabaseClient";

type Notice = {
  id: string;
  year_month: string;
  body: string;
  updated_at: string;
};

function currentMonthJst(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

export default function MonitoringOfficeNoticePage() {
  const { role, loading: roleLoading } = useRoleContext();
  const [yearMonth, setYearMonth] = useState(currentMonthJst());
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "処理に失敗しました");
    return payload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const payload = await request(
        `/api/monitorings/monthly-notice?year_month=${encodeURIComponent(yearMonth)}`,
      );
      const next = (payload.data ?? null) as Notice | null;
      setNotice(next);
      setBody(next?.body ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setNotice(null);
      setBody("");
    } finally {
      setLoading(false);
    }
  }, [request, yearMonth]);

  useEffect(() => {
    if (role === "manager" || role === "admin") void load();
  }, [load, role]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = await request("/api/monitorings/monthly-notice", {
        method: "PUT",
        body: JSON.stringify({ year_month: yearMonth, body }),
      });
      setNotice(payload.data as Notice);
      setBody(String(payload.data.body ?? ""));
      setMessage("モニタリング共通お知らせを保存しました。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  if (roleLoading) return <main className="p-6">権限を確認しています…</main>;
  if (role !== "manager" && role !== "admin") {
    return <main className="p-6">このページへのアクセス権限がありません。</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <p className="text-sm text-slate-500">介護保険モニタリング</p>
          <h1 className="text-2xl font-bold text-slate-900">モニタリング「事業所より」設定</h1>
          <p className="mt-2 text-sm text-slate-600">
            個別の「事業所より」が未入力の場合に使う、月ごとの共通お知らせです。
          </p>
        </header>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{message}</div>}

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <label className="block max-w-xs text-sm font-medium">
            対象年月
            <input
              type="month"
              value={yearMonth}
              onChange={(event) => setYearMonth(event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </label>

          <label className="mt-5 block text-sm font-medium">
            事業所より
            <textarea
              rows={10}
              value={body}
              disabled={loading}
              onChange={(event) => setBody(event.target.value)}
              placeholder="この月の共通お知らせを入力してください"
              className="mt-1 w-full rounded-md border px-3 py-2 font-normal disabled:bg-slate-100"
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            AI生成では変更されません。個別に入力済みの内容がある場合は、個別内容が優先されます。
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={loading || saving || !yearMonth}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 font-semibold text-white disabled:opacity-50"
            >
              <Save size={17} /> {saving ? "保存中…" : notice ? "更新" : "保存"}
            </button>
            <span className="text-sm text-slate-500">
              {loading
                ? "読み込み中…"
                : notice
                  ? `最終更新：${new Date(notice.updated_at).toLocaleString("ja-JP")}`
                  : "この月は未登録です"}
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
