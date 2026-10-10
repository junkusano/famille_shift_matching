"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRoleContext } from "@/context/RoleContext";
import { supabase } from "@/lib/supabaseClient";
import { countChange, type RecruitmentReport, type AnalyticsWeek } from "@/lib/knowledge-automation/recruitmentAnalyticsCore";

type SavedReport = { id: string; title: string; content: string; period_start: string; period_end: string; metadata: { recruitmentReport?: RecruitmentReport } };

function WeekTables({ week, label }: { week: AnalyticsWeek; label: string }) {
  return <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">{label}の集計根拠（{week.period.start}〜{week.period.end}）</summary>
    {week.warnings.map(w => <p key={w} className="mt-2 text-sm text-amber-800">{w}</p>)}
    {week.tables.map((t, index) => <div key={index} className="mt-5 overflow-x-auto"><h3 className="font-medium">{t.label}</h3>
      <table className="mt-2 w-full text-left text-sm"><thead className="bg-slate-100"><tr>{t.columns.map(c => <th key={c} className="p-2">{c}</th>)}</tr></thead>
        <tbody>{t.rows.map((row, i) => <tr key={i} className="border-b">{row.map((v, j) => <td key={j} className="max-w-md break-all p-2">{typeof v === "number" ? v.toLocaleString("ja-JP", { maximumFractionDigits: 3 }) : v}</td>)}</tr>)}</tbody></table>
      {!t.rows.length && <p className="mt-2 text-sm">対象行なし（未計測を含むため、ゼロと断定できません）</p>}
      {t.limited && <p className="mt-2 text-xs text-slate-600">上位行のみ掲載しています。</p>}
    </div>)}
  </details>;
}

export default function RecruitmentAnalyticsPage() {
  const { role, loading: roleLoading } = useRoleContext();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const allowed = role === "admin" || role === "manager";
  useEffect(() => {
    if (roleLoading || !allowed) return;
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new Error("再ログインしてください。");
        const response = await fetch("/api/recruitment-analytics", { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "取得に失敗しました。");
        if (active) { setReports(body.reports); setSelected(body.reports[0]?.id || ""); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "取得に失敗しました。"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [roleLoading, allowed]);
  if (roleLoading) return <p className="p-6">読み込み中…</p>;
  if (!allowed) return <p className="p-6">このページは管理者・マネジャー向けです。</p>;
  const saved = reports.find(r => r.id === selected);
  const report = saved?.metadata.recruitmentReport;
  const change = report ? countChange(report.current.entries, report.previous.entries) : null;
  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
    <header><h1 className="text-2xl font-bold">応募導線分析</h1><p className="mt-2 text-slate-600">LP → エントリーページ → 応募実数。前週の結果と改善案を、次の議論につなげます。</p>
      <nav className="mt-3 flex flex-wrap gap-4 text-sm text-indigo-700"><Link href="/portal/knowledge-automation">ナレッジ活用自動化・実行設定</Link><Link href="/portal/entry-list">エントリー一覧</Link>{role === "admin" && <Link href="/portal/admin/knowledge">ナレッジサマリーを確認・編集</Link>}</nav></header>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-4">{error}</p>}
    {loading && <p>読み込み中…</p>}
    {!loading && !error && !reports.length && <p className="rounded-xl border bg-white p-6">まだレポートはありません。「ナレッジ活用自動化」の「応募導線分析・週次レポート」から実行できます。</p>}
    {!!reports.length && <label className="block text-sm font-medium">対象週<select value={selected} onChange={e => setSelected(e.target.value)} className="ml-3 rounded border bg-white p-2">{reports.map(r => <option key={r.id} value={r.id}>{r.period_start}〜{r.period_end}</option>)}</select></label>}
    {report && <>
      <section className="grid gap-3 sm:grid-cols-3">{[["新規エントリー登録", report.current.entries === null ? "未取得" : `${report.current.entries}件`], ["前々週", report.previous.entries === null ? "未取得" : `${report.previous.entries}件`], ["前週差", change?.difference == null ? "比較できません" : `${change.difference > 0 ? "+" : ""}${change.difference}件${change.percent === null ? "（比較元0件）" : `（${change.percent}%）`}`]].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</section>
      <p className="text-sm text-slate-600">新規登録件数です。再応募の送信回数・採用人数・LP別応募数とは異なります。</p>
      {[["今週の評価", report.overview], ["意図した応募導線は機能しているか", report.routeAssessment], ["ページ・コラムの影響", report.contentAssessment]].map(([title, content]) => <section key={title} className="rounded-xl border bg-white p-5"><h2 className="font-bold">{title}</h2><p className="mt-3 whitespace-pre-wrap leading-7">{content}</p></section>)}
      <section><h2 className="text-lg font-bold">改善案と次の議論</h2><p className="mt-1 text-sm text-slate-600">ナレッジサマリーに保存済みの検討案です。次回の分析でも参照します。</p><div className="mt-3 grid gap-4 md:grid-cols-2">{report.improvements.map((item, i) => <article key={i} className="rounded-xl border bg-white p-5"><h3 className="font-bold">{i + 1}. {item.target} <span className="text-sm text-indigo-700">優先度：{item.priority}</span></h3><dl className="mt-3 space-y-3 text-sm">{[["根拠", item.evidence], ["仮説", item.hypothesis], ["具体的な対策", item.action], ["次回の検証指標", item.metric], ["深めたい議論", item.discussion]].map(([label, text]) => <div key={label}><dt className="font-semibold text-slate-600">{label}</dt><dd className="mt-1 whitespace-pre-wrap leading-6">{text}</dd></div>)}</dl></article>)}</div></section>
      <WeekTables week={report.current} label="前週" /><WeekTables week={report.previous} label="前々週" />
      <details className="rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">Clarity・関連ナレッジ</summary>{!report.clarity.length && <p className="mt-3">対象期間のClarity記録がありません。</p>}{report.clarity.map(c => <div key={c.id} className="mt-4"><h3 className="font-semibold">{c.title}（{c.period_start}〜{c.period_end}）</h3><p className="mt-1 whitespace-pre-wrap text-sm">{c.summary}</p></div>)}{report.knowledge.map(k => <div key={k.id} className="mt-4"><h3 className="font-semibold">{k.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm">{k.summary}</p></div>)}</details>
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold">計測の範囲・確認が必要な点</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{report.limitations.map(l => <li key={l}>{l}</li>)}</ul></section>
    </>}
    {saved && !report && <pre className="whitespace-pre-wrap rounded-xl border bg-white p-5">{saved.content}</pre>}
  </main>;
}
