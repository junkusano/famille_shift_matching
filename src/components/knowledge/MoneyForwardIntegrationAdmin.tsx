"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { knowledgeApi } from "@/components/knowledge/api";

type Connection = {
  id: string;
  status: string;
  provider_account_id: string | null;
  provider_account_name: string | null;
  token_expires_at: string | null;
  scopes: string[];
  last_connected_at: string | null;
  last_refreshed_at: string | null;
  last_tested_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
};
type StatusResponse = { ok: true; connection: Connection | null; configured: boolean };
type ConnectResponse = { ok: true; authorizationUrl: string };

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export function MoneyForwardIntegrationAdmin() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await knowledgeApi<StatusResponse>("/api/admin/knowledge/integrations/moneyforward");
      setConnection(response.connection);
      setConfigured(response.configured);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "接続状態を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("moneyforward");
    if (result === "connected") setMessage("Money Forwardとの接続が完了しました。");
    else if (result) setMessage("Money Forwardとの接続を完了できませんでした。設定と認可内容を確認してください。");
    void load();
  }, [load]);

  async function connect() {
    setBusy(true);
    try {
      const response = await knowledgeApi<ConnectResponse>("/api/admin/knowledge/integrations/moneyforward", { method: "POST" });
      window.location.assign(response.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "接続を開始できませんでした。");
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    try {
      const response = await knowledgeApi<{ ok: true; tenant: { id: string; name: string } }>("/api/admin/knowledge/integrations/moneyforward/test", { method: "POST" });
      setMessage(`接続確認に成功しました：${response.tenant.name}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "接続確認に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Money Forwardとの接続を解除しますか？保存済みtokenは削除されます。")) return;
    setBusy(true);
    try {
      await knowledgeApi("/api/admin/knowledge/integrations/moneyforward", { method: "DELETE" });
      setMessage("Money Forwardとの接続を解除しました。");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "接続解除に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const connected = connection?.status === "connected";
  return <section className="space-y-4">
    {message && <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div>}
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div><h2 className="text-lg font-bold text-slate-900">Money Forwardクラウド会計</h2><p className="mt-1 text-sm text-slate-600">OAuth 2.0の読み取り接続。現在はtenant確認だけを行い、仕訳の書き込みは行いません。</p></div>
        <span className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${connected ? "bg-emerald-100 text-emerald-800" : connection?.status === "error" || connection?.status === "refresh_required" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{loading ? "確認中" : connected ? "接続済み" : connection?.status === "refresh_required" ? "再接続が必要" : "未接続"}</span>
      </div>
      {!configured && <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Vercelに MF_CLIENT_ID、MF_CLIENT_SECRET、MF_REDIRECT_URI、KNOWLEDGE_TOKEN_ENCRYPTION_KEY の設定が必要です。</div>}
      <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-slate-500">事業者</dt><dd className="mt-1 font-medium">{connection?.provider_account_name ?? "—"}</dd></div>
        <div><dt className="text-slate-500">事業者ID</dt><dd className="mt-1 font-medium">{connection?.provider_account_id ?? "—"}</dd></div>
        <div><dt className="text-slate-500">最終接続</dt><dd className="mt-1">{formatDate(connection?.last_connected_at ?? null)}</dd></div>
        <div><dt className="text-slate-500">最終接続確認</dt><dd className="mt-1">{formatDate(connection?.last_tested_at ?? null)}</dd></div>
        <div><dt className="text-slate-500">Token有効期限</dt><dd className="mt-1">{formatDate(connection?.token_expires_at ?? null)}</dd></div>
        <div><dt className="text-slate-500">最終更新</dt><dd className="mt-1">{formatDate(connection?.last_refreshed_at ?? null)}</dd></div>
        <div className="md:col-span-2"><dt className="text-slate-500">Scope</dt><dd className="mt-1 break-all font-mono text-xs">{connection?.scopes?.join(" ") || "—"}</dd></div>
      </dl>
      {connection?.last_error_message && <p className="mt-4 rounded bg-rose-50 p-3 text-sm text-rose-800">{connection.last_error_message}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => void connect()} disabled={busy || !configured}><Link2 size={16} className="mr-2" />{connected ? "再接続" : "接続"}</Button>
        <Button variant="outline" onClick={() => void testConnection()} disabled={busy || !connected}><RefreshCw size={16} className="mr-2" />接続確認</Button>
        <Button variant="outline" onClick={() => void disconnect()} disabled={busy || !connection}><Unlink size={16} className="mr-2" />接続解除</Button>
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><p className="font-semibold">安全設計</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>Client Secretと暗号鍵は環境変数のみ</li><li>OAuth tokenはAES-256-GCMで暗号化</li><li>tokenをブラウザ・APIレスポンス・ログへ出さない</li><li>財務情報はprivacy level 2 / internal_only</li></ul></div>
  </section>;
}

