import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { buildMoneyForwardAuthorizationUrl } from "@/lib/moneyforward/client";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { data, error } = await supabaseAdmin
    .from("knowledge_integrations")
    .select("id,provider,status,provider_account_id,provider_account_name,token_expires_at,scopes,last_connected_at,last_refreshed_at,last_tested_at,last_error_at,last_error_code,last_error_message")
    .eq("provider", "moneyforward")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "接続状態を取得できませんでした。" }, { status: 500 });
  return NextResponse.json({ ok: true, connection: data ?? null, configured: Boolean(process.env.MF_CLIENT_ID && process.env.MF_CLIENT_SECRET && process.env.MF_REDIRECT_URI && process.env.KNOWLEDGE_TOKEN_ENCRYPTION_KEY) });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const state = randomBytes(32).toString("base64url");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { error } = await supabaseAdmin.from("integration_oauth_states").insert({
    provider: "moneyforward",
    state_hash: stateHash,
    initiated_by: auth.actor.authUser.id,
    return_path: "/portal/admin/knowledge/integrations",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, error: "接続処理を開始できませんでした。" }, { status: 500 });
  try {
    const response = NextResponse.json({ ok: true, authorizationUrl: buildMoneyForwardAuthorizationUrl(state) });
    response.cookies.set("mf_knowledge_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "Money Forward環境変数を確認してください。" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { error } = await supabaseAdmin.from("knowledge_integrations").update({
    status: "disconnected",
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    access_token_secret_id: null,
    refresh_token_secret_id: null,
    token_expires_at: null,
    last_error_at: null,
    last_error_code: null,
    last_error_message: null,
  }).eq("provider", "moneyforward");
  if (error) return NextResponse.json({ ok: false, error: "接続解除に失敗しました。" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

