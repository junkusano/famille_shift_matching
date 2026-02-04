// src/app/api/spot/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Number(searchParams.get("limit") ?? "200");

  let query = supabaseAdmin
    .from("spot_offer_template_unified")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200);

  if (q) {
    // タイトル/住所/ラベルあたりを雑に検索（必要に応じて拡張）
    // ilike は OR が必要なので `or(...)` を使う
    query = query.or(
      `template_title.ilike.%${q}%,work_address.ilike.%${q}%,internal_label.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  return json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const { data, error } = await supabaseAdmin
    .from("spot_offer_template_unified")
    .insert({
      ...body,
      // created_at/updated_at は default があるが、updated_at は明示更新してもOK
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json(data, 201);
}
