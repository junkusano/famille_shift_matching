import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { exchangeMoneyForwardCode, getMoneyForwardTenant } from "@/lib/moneyforward/client";
import { encryptIntegrationSecret } from "@/lib/moneyforward/crypto";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectResult(request: NextRequest, result: string) {
  const response = NextResponse.redirect(new URL(`/portal/admin/knowledge/integrations?moneyforward=${result}`, request.url));
  response.cookies.set("mf_knowledge_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = request.cookies.get("mf_knowledge_oauth_state")?.value;
  if (!code || !state || !cookieState) return redirectResult(request, "invalid_state");
  const stateBuffer = Buffer.from(state);
  const cookieBuffer = Buffer.from(cookieState);
  if (stateBuffer.length !== cookieBuffer.length || !timingSafeEqual(stateBuffer, cookieBuffer)) return redirectResult(request, "invalid_state");
  const stateHash = createHash("sha256").update(state).digest("hex");
  const { data: oauthState } = await supabaseAdmin
    .from("integration_oauth_states")
    .select("id,initiated_by,expires_at,consumed_at")
    .eq("provider", "moneyforward")
    .eq("state_hash", stateHash)
    .maybeSingle();
  if (!oauthState || oauthState.consumed_at || new Date(oauthState.expires_at).getTime() <= Date.now()) return redirectResult(request, "invalid_state");
  const { data: admin } = await supabaseAdmin.from("users").select("system_role").eq("auth_user_id", oauthState.initiated_by).maybeSingle();
  if (admin?.system_role !== "admin") return redirectResult(request, "forbidden");

  try {
    const token = await exchangeMoneyForwardCode(code);
    const tenant = await getMoneyForwardTenant(token.accessToken);
    const { data: existing } = await supabaseAdmin.from("knowledge_integrations").select("id").eq("provider", "moneyforward").eq("provider_account_id", tenant.accountId).maybeSingle();
    const payload = {
      provider: "moneyforward",
      status: "connected",
      provider_account_id: tenant.accountId,
      provider_account_name: tenant.accountName,
      token_storage: "aes_gcm",
      access_token_encrypted: encryptIntegrationSecret(token.accessToken),
      refresh_token_encrypted: token.refreshToken ? encryptIntegrationSecret(token.refreshToken) : null,
      token_expires_at: token.expiresAt,
      scopes: token.scopes,
      metadata: tenant.metadata,
      last_connected_at: new Date().toISOString(),
      last_tested_at: new Date().toISOString(),
      last_error_at: null,
      last_error_code: null,
      last_error_message: null,
      created_by: oauthState.initiated_by,
    };
    const result = existing
      ? await supabaseAdmin.from("knowledge_integrations").update(payload).eq("id", existing.id).select("id").single()
      : await supabaseAdmin.from("knowledge_integrations").insert(payload).select("id").single();
    if (result.error || !result.data) throw new Error("Connection save failed");
    await supabaseAdmin.from("knowledge_sources").update({ integration_id: result.data.id }).eq("source_key", "moneyforward-accounting");
    await supabaseAdmin.from("integration_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", oauthState.id);
    return redirectResult(request, "connected");
  } catch {
    await supabaseAdmin.from("integration_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", oauthState.id);
    return redirectResult(request, "failed");
  }
}

