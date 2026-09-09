import { supabaseAdmin } from "@/lib/supabase/service";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type SearchParams = { service?: string; page_type?: string; error?: string };

export const dynamic = "force-dynamic";

export default async function RpaDiagnosticsPage({ searchParams }: { searchParams?: SearchParams }) {
  const auth = createServerComponentClient({ cookies });
  const { data: authData } = await auth.auth.getUser();
  if (!authData.user) redirect("/login");
  const { data: staff } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (!["admin", "manager"].includes((staff?.system_role ?? "").toLowerCase())) redirect("/portal");

  const service = searchParams?.service?.trim() ?? "";
  const pageType = searchParams?.page_type?.trim() ?? "";
  let query = supabaseAdmin
    .from("rpa_page_snapshots")
    .select("*, rpa_diagnostics(id,operation,stage,error_name,error_message,error_stack,capture_type,created_at)")
    .order("captured_at", { ascending: false })
    .limit(100);
  if (service) query = query.eq("service", service);
  if (pageType) query = query.eq("page_type", pageType);
  const { data, error } = await query;
  const rows = (data ?? []).map((item) => {
    const diagnostics = Array.isArray(item.rpa_diagnostics) ? item.rpa_diagnostics : [];
    const diagnostic = diagnostics[0] as Record<string, unknown> | undefined;
    return { ...item, diagnostic };
  }).filter((item) => searchParams?.error !== "1" || Boolean(item.diagnostic?.error_message));

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">RPA診断・DOM Snapshot</h1>
        <p className="text-sm text-gray-600">RPAが取得したページ構造を、エラー解析と開発用の最新資料として確認します。</p>
      </div>
      <form className="flex flex-wrap gap-2 items-end rounded border bg-gray-50 p-3 text-sm">
        <label>サービス<input name="service" defaultValue={service} placeholder="taimee" className="block border rounded px-2 py-1" /></label>
        <label>ページ種別<input name="page_type" defaultValue={pageType} placeholder="worker_detail" className="block border rounded px-2 py-1" /></label>
        <label className="flex gap-1 items-center"><input type="checkbox" name="error" value="1" defaultChecked={searchParams?.error === "1"} />エラーのみ</label>
        <button className="rounded bg-slate-700 px-3 py-1 text-white" type="submit">検索</button>
      </form>
      {error && <p className="text-red-600">診断情報を取得できませんでした。</p>}
      <div className="space-y-3">
        {rows.map((item) => (
          <details key={item.id} className="rounded border bg-white p-3">
            <summary className="cursor-pointer">
              <span className="font-semibold">{new Date(item.captured_at).toLocaleString("ja-JP")}</span>
              <span className="ml-3">{item.service} / {item.page_type ?? "-"} / {String(item.diagnostic?.operation ?? "-")} / {String(item.diagnostic?.stage ?? "-")}</span>
              {item.diagnostic?.error_message && <span className="ml-3 text-red-600">エラー</span>}
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs">
              <div><b>URL</b><div className="break-all">{item.page_url ?? "-"}</div></div>
              <div><b>Snapshot ID</b><div>{item.snapshot_id}</div></div>
              <div><b>RPA Version</b><div>{item.extension_version ?? "-"} / manifest {item.manifest_version ?? "-"}</div></div>
              <div><b>Fingerprint</b><div>{item.dom_fingerprint ?? "-"}</div></div>
              <div className="md:col-span-2"><b>エラー</b><pre className="whitespace-pre-wrap rounded bg-red-50 p-2">{[item.diagnostic?.error_name, item.diagnostic?.error_message, item.diagnostic?.error_stack].filter(Boolean).join("\n") || "-"}</pre></div>
              <div className="md:col-span-2"><b>表示テキスト</b><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{item.body_text ?? "-"}</pre></div>
              <div className="md:col-span-2"><b>重要DOM</b><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{JSON.stringify(item.important_dom ?? {}, null, 2)}</pre></div>
              <div className="md:col-span-2"><b>Scripts</b><pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{JSON.stringify(item.scripts ?? [], null, 2)}</pre></div>
            </div>
          </details>
        ))}
        {!error && !rows.length && <p className="text-gray-500">診断情報はありません。</p>}
      </div>
    </div>
  );
}
