"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Provider = "kaitek" | "ucare";
type Preset = { id: string; provider: Provider; label: string; office_name: string | null; office_id: string | null; template_name: string | null; template_id: string | null; recruiting_id: string | null; is_enabled: boolean };

const empty = { provider: "kaitek" as Provider, label: "", office_name: "", office_id: "", template_name: "", template_id: "", recruiting_id: "" };

export default function RpaJobPresetsPage() {
  const [rows, setRows] = useState<Preset[]>([]);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");

  async function authHeaders() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("ログインセッションを確認できません。再ログインしてください。");
    }
    return { Authorization: `Bearer ${data.session.access_token}` };
  }

  async function load() {
    try {
      const response = await fetch("/api/rpa/job-presets", { headers: await authHeaders() });
      const body = await response.json();
      if (response.ok) setRows(body.presets ?? []);
      else setMessage(body.error ?? "読み込みに失敗しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "読み込みに失敗しました。");
    }
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    setMessage("");
    try {
      const response = await fetch("/api/rpa/job-presets", { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) { setMessage(body.error ?? "保存に失敗しました。"); return; }
      setMessage("保存しました。"); setForm(empty); await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    }
  }

  const field = (key: keyof typeof empty, label: string, required = false) => (
    <label className="block text-sm"><span className="mb-1 block text-gray-600">{label}{required ? " *" : ""}</span><input className="w-full rounded border px-2 py-2" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>
  );

  return <main className="mx-auto max-w-6xl space-y-5 p-4 text-gray-900">
    <header><h1 className="text-xl font-bold">RPA求人プリセット管理</h1><p className="mt-1 text-sm text-gray-600">ラベルを選ぶと、事業所・テンプレート・求人IDをRPAへ内部的に渡します。</p></header>
    {message && <div className="rounded border bg-blue-50 p-3 text-sm">{message}</div>}
    <section className="rounded border bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">プリセット登録</h2><div className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm"><span className="mb-1 block text-gray-600">サービス *</span><select className="w-full rounded border px-2 py-2" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as Provider })}><option value="kaitek">カイテク</option><option value="ucare">Ucare</option></select></label>
      {field("label", "表示ラベル", true)}{field("office_name", "事業所名")}{field("office_id", "事業所ID")}{field("template_name", "テンプレート名")}{field("template_id", "テンプレートID")}{field("recruiting_id", "求人ID（内部値）")}
    </div><button className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => void save()}>保存</button></section>
    <section className="overflow-x-auto rounded border bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-gray-50"><tr>{["サービス","ラベル","事業所","テンプレート","状態"].map((x) => <th className="px-3 py-2" key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="border-t" key={row.id}><td className="px-3 py-2">{row.provider === "kaitek" ? "カイテク" : "Ucare"}</td><td className="px-3 py-2 font-medium">{row.label}</td><td className="px-3 py-2">{row.office_name ?? "—"}</td><td className="px-3 py-2">{row.template_name ?? "—"}</td><td className="px-3 py-2">{row.is_enabled ? "有効" : "無効"}</td></tr>)}</tbody></table></section>
  </main>;
}
