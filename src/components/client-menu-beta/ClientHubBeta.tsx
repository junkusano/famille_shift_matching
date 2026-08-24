"use client";

import { ClientMenuBeta } from "./ClientMenuBeta";

export function ClientHubBeta() {
  return <main className="min-h-[60vh] bg-slate-50 p-4 md:p-8"><div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-orange-700">BETA</p><h1 className="mt-1 text-2xl font-bold text-slate-900">利用者情報ハブ</h1><p className="mt-2 text-slate-600">利用者を選択して、関連する主要画面へ移動します。</p></div><ClientMenuBeta /></div><div className="mt-8 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">右上の「利用者メニュー」から、検索して対象利用者を選択してください。</div></div></main>;
}
