import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth/requireAdmin";
import { getMoneyForwardTenant } from "@/lib/moneyforward/client";
import { getMoneyForwardAccessToken } from "@/lib/moneyforward/tokens";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.ok === false) return auth.response;
  const { data: integration } = await supabaseAdmin.from("knowledge_integrations").select("id").eq("provider", "moneyforward").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!integration) return NextResponse.json({ ok: false, error: "Money Forwardは未接続です。" }, { status: 400 });
  try {
    const accessToken = await getMoneyForwardAccessToken(integration.id);
    const tenant = await getMoneyForwardTenant(accessToken);
    await supabaseAdmin.from("knowledge_integrations").update({ status: "connected", provider_account_name: tenant.accountName, last_tested_at: new Date().toISOString(), last_error_at: null, last_error_code: null, last_error_message: null }).eq("id", integration.id);
    return NextResponse.json({ ok: true, tenant: { id: tenant.accountId, name: tenant.accountName } });
  } catch {
    return NextResponse.json({ ok: false, error: "接続確認に失敗しました。再接続が必要な場合があります。" }, { status: 502 });
  }
}

