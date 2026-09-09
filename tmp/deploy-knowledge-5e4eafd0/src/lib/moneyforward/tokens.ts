import "server-only";

import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/moneyforward/crypto";
import { refreshMoneyForwardToken } from "@/lib/moneyforward/client";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function getMoneyForwardAccessToken(integrationId: string) {
  const { data, error } = await supabaseAdmin
    .from("knowledge_integrations")
    .select("id,status,access_token_encrypted,refresh_token_encrypted,token_expires_at")
    .eq("id", integrationId)
    .eq("provider", "moneyforward")
    .maybeSingle();
  if (error || !data) throw new Error("Money Forward connection was not found.");
  if (data.status !== "connected" || !data.access_token_encrypted) throw new Error("Money Forward is not connected.");

  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 5 * 60_000) return decryptIntegrationSecret(data.access_token_encrypted);
  if (!data.refresh_token_encrypted) throw new Error("Money Forward reconnection is required.");

  try {
    const refreshed = await refreshMoneyForwardToken(decryptIntegrationSecret(data.refresh_token_encrypted));
    const { error: updateError } = await supabaseAdmin.from("knowledge_integrations").update({
      status: "connected",
      access_token_encrypted: encryptIntegrationSecret(refreshed.accessToken),
      refresh_token_encrypted: refreshed.refreshToken ? encryptIntegrationSecret(refreshed.refreshToken) : data.refresh_token_encrypted,
      token_expires_at: refreshed.expiresAt,
      scopes: refreshed.scopes,
      last_refreshed_at: new Date().toISOString(),
      last_error_at: null,
      last_error_code: null,
      last_error_message: null,
    }).eq("id", integrationId);
    if (updateError) throw updateError;
    return refreshed.accessToken;
  } catch {
    await supabaseAdmin.from("knowledge_integrations").update({
      status: "refresh_required",
      last_error_at: new Date().toISOString(),
      last_error_code: "TOKEN_REFRESH_FAILED",
      last_error_message: "再認証が必要です。",
    }).eq("id", integrationId);
    throw new Error("Money Forward reconnection is required.");
  }
}

