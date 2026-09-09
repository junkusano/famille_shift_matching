import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readSecret(name: string) {
  const { data, error } = await supabaseAdmin.rpc("read_secret", { secret_name: name });
  return error || typeof data !== "string" || !data.trim() ? null : data;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { data, error } = await supabaseAdmin
    .from("knowledge_sources")
    .select("*,checkpoint:knowledge_source_checkpoints(cursor,cursor_version,last_success_at)")
    .order("name");
  if (error) return NextResponse.json({ ok: false, error: "情報源を取得できませんでした。" }, { status: 500 });
  const sources = data ?? [];
  const hasGoogleAnalytics = sources.some((source) => source.connector_key === "google_analytics");
  const hasClarity = sources.some((source) => source.connector_key === "microsoft_clarity");
  const [googleSecret, claritySecret] = await Promise.all([
    hasGoogleAnalytics ? readSecret("google_service_account_key") : Promise.resolve(null),
    hasClarity ? readSecret("clarity_data_export_api_token") : Promise.resolve(null),
  ]);
  let serviceAccountEmail = "";
  if (googleSecret) {
    try {
      const credentials = JSON.parse(googleSecret) as { client_email?: unknown };
      if (typeof credentials.client_email === "string") serviceAccountEmail = credentials.client_email;
    } catch {
      serviceAccountEmail = "";
    }
  }
  const decorated = sources.map((source) => {
    if (source.connector_key === "google_analytics") {
      const propertyConfigured = /^\d+$/.test(String(source.config?.propertyId ?? ""));
      const issues = [
        ...(!propertyConfigured ? ["GA4の数値プロパティIDを設定してください。"] : []),
        ...(!serviceAccountEmail ? ["Googleサービスアカウントの認証情報を確認してください。"] : []),
      ];
      return {
        ...source,
        setup_status: {
          ready: issues.length === 0,
          issues,
          serviceAccountEmail: serviceAccountEmail || undefined,
          secretConfigured: Boolean(googleSecret),
        },
      };
    }
    if (source.connector_key === "microsoft_clarity") {
      const issues = claritySecret ? [] : ["Clarity Data Export APIトークンをSupabase Vaultへ登録してください。"];
      return { ...source, setup_status: { ready: issues.length === 0, issues, secretConfigured: Boolean(claritySecret) } };
    }
    return source;
  });
  return NextResponse.json({ ok: true, sources: decorated });
}
