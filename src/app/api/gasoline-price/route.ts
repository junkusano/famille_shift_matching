import { NextRequest, NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  const denied = await requireManagerOrAdmin(request);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from("monthly_gasoline_prices")
    .select("price_yen_per_liter, prefecture, fuel_type, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[gasoline-price] load error", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, price: data });
}
