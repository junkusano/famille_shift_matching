import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";

type Provider = "kaitek" | "ucare";

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get("origin");
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://myfamille.shi-on.net";
  const allowed = !origin || origin === siteOrigin || /^chrome-extension:\/\/[a-z]{32}$/.test(origin);
  return {
    ...(allowed && origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}

function json(request: NextRequest, body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function text(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const valueText = value.trim();
  return valueText ? valueText.slice(0, max) : null;
}

function provider(value: unknown): Provider | null {
  return value === "kaitek" || value === "ucare" ? value : null;
}

function normalize(body: Record<string, unknown>) {
  const providerValue = provider(body.provider);
  const label = text(body.label, 100);
  if (!providerValue || !label) return { error: "providerとlabelは必須です。" } as const;
  if (providerValue === "kaitek" && (!text(body.office_id) || !text(body.template_id))) {
    return { error: "カイテクはoffice_idとtemplate_idが必須です。" } as const;
  }
  if (providerValue === "ucare" && !text(body.template_id) && !text(body.recruiting_id)) {
    return { error: "Ucareはtemplate_idまたはrecruiting_idが必須です。" } as const;
  }
  return {
    value: {
      provider: providerValue,
      label,
      office_name: text(body.office_name),
      office_id: text(body.office_id),
      template_name: text(body.template_name),
      template_id: text(body.template_id),
      recruiting_id: text(body.recruiting_id) ?? text(body.template_id),
      is_enabled: typeof body.is_enabled === "boolean" ? body.is_enabled : true,
      updated_at: new Date().toISOString(),
    },
  } as const;
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const providerValue = provider(request.nextUrl.searchParams.get("provider"));
    const label = text(request.nextUrl.searchParams.get("label"), 100);
    let query = supabaseAdmin.from("rpa_job_presets").select("*").eq("is_enabled", true).order("provider").order("label");
    if (providerValue) query = query.eq("provider", providerValue);
    if (label) query = query.eq("label", label);
    const { data, error } = await query;
    if (error) throw error;
    return json(request, { ok: true, presets: data ?? [] });
  } catch (error) {
    if (isRpaTaimeeError(error)) return json(request, { ok: false, error: error.message }, error.status);
    console.error("[rpa/job-presets] GET failed", error);
    return json(request, { ok: false, error: "プリセットの取得に失敗しました。" }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const normalized = normalize(body);
    if ("error" in normalized) return json(request, { ok: false, error: normalized.error }, 400);
    const { data, error } = await supabaseAdmin.from("rpa_job_presets").insert(normalized.value).select("*").single();
    if (error) return json(request, { ok: false, error: error.message }, error.code === "23505" ? 409 : 500);
    return json(request, { ok: true, preset: data }, 201);
  } catch (error) {
    if (isRpaTaimeeError(error)) return json(request, { ok: false, error: error.message }, error.status);
    console.error("[rpa/job-presets] POST failed", error);
    return json(request, { ok: false, error: "プリセットの登録に失敗しました。" }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const id = text(body.id, 50);
    if (!id) return json(request, { ok: false, error: "idは必須です。" }, 400);
    const normalized = normalize(body);
    if ("error" in normalized) return json(request, { ok: false, error: normalized.error }, 400);
    const { data, error } = await supabaseAdmin.from("rpa_job_presets").update(normalized.value).eq("id", id).select("*").single();
    if (error) return json(request, { ok: false, error: error.message }, 500);
    return json(request, { ok: true, preset: data });
  } catch (error) {
    if (isRpaTaimeeError(error)) return json(request, { ok: false, error: error.message }, error.status);
    console.error("[rpa/job-presets] PATCH failed", error);
    return json(request, { ok: false, error: "プリセットの更新に失敗しました。" }, 500);
  }
}
