"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ReapplyPage() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const res = await fetch("/api/entry/reapply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      setMessage(data.message || "受付を完了できませんでした。");
    } catch { setMessage("再応募の受付を完了できませんでした。時間をおいてお試しください。"); }
    finally { setSubmitting(false); }
  }
  return <main className="min-h-screen bg-famille px-4 py-10 text-gray-800"><div className="mx-auto max-w-xl rounded bg-white p-8 shadow space-y-6">
    <div><Link href="/entry" className="text-sm underline">通常応募へ戻る</Link><h1 className="mt-4 text-2xl font-bold text-famille">再応募</h1><p className="mt-2 text-sm text-gray-600">以前の応募情報を引き継いで確認します。入力内容から過去の応募状況は表示しません。</p></div>
    <section className="rounded-lg border border-famille/30 bg-famille/5 p-4 text-sm leading-7 text-gray-700"><p className="font-semibold text-famille">リエントリーを歓迎します。</p><p className="mt-2">好きな時間でシフトに入れるシフ子、日払い制度、パフォーマンスをスコア化して時給アップを目指せる仕組みなど、便利でモチベーションを高める仕組みを日々充実させています。新しいファミーユでの経験を、ぜひ始めてください。</p></section>
    <form onSubmit={submit} className="space-y-4">
      {[['lastNameKanji','氏（漢字）'],['firstNameKanji','名（漢字）'],['lastNameKana','氏（ふりがな）'],['firstNameKana','名（ふりがな）'],['phone','電話番号'],['email','メールアドレス']].map(([name,label]) => <label key={name} className="block text-sm font-medium">{label}<input required name={name} type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'} className="mt-1 w-full rounded border p-2" /></label>)}
      <fieldset><legend className="text-sm font-medium">生年月日</legend><div className="mt-1 flex gap-2"><input required name="birthYear" type="number" placeholder="年" className="w-1/3 rounded border p-2" /><input required name="birthMonth" type="number" placeholder="月" className="w-1/3 rounded border p-2" /><input required name="birthDay" type="number" placeholder="日" className="w-1/3 rounded border p-2" /></div></fieldset>
      <label className="block text-sm font-medium">どのような理由から、再度ファミーユにエントリーしようと考えていますか？<textarea required name="reapplyReason" rows={5} className="mt-1 w-full rounded border p-2 font-normal" placeholder="再応募を考えた理由をお聞かせください。" /></label>
      <button disabled={submitting} className="w-full rounded bg-famille py-2 font-semibold text-white disabled:opacity-50">{submitting ? "送信中…" : "再応募を申請する"}</button>
    </form>{message && <p className="rounded bg-gray-50 p-3 text-sm">{message}</p>}
  </div></main>;
}
